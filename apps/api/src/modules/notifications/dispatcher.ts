import { and, asc, eq, lte } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { notifications } from "../../db/schema/index.js";
import type { MailSender } from "./mail.js";
import { PermanentMailError, renderTemplate } from "./templates.js";

// Transactional-outbox dispatcher (ARCHITECTURE §10). Rows are written by the business transaction; this only drains them.
// Delivery is at-least-once: each batch is claimed with FOR UPDATE SKIP LOCKED and the row locks are held until the outcome is
// written, so concurrent dispatchers (several processes, or overlapping ticks) never pick the same row. A crash mid-send rolls
// the claim back and the row is retried (a mail may then go out twice, never zero times).

export const MAX_ATTEMPTS = 5;
export const BATCH_SIZE = 20;
export const BACKOFF_BASE_MS = 30_000;
const MAX_ERROR_LEN = 500;

/** Delay before the next try after the `attempts`-th failure (1-based): 30 s, 60 s, 120 s, 240 s. */
export const backoffMs = (attempts: number, base = BACKOFF_BASE_MS) => base * 2 ** (attempts - 1);

const describe = (err: unknown) => (err instanceof Error ? err.message : String(err)).replace(/\s+/g, " ").slice(0, MAX_ERROR_LEN);

export interface DispatcherOptions {
  db: Db;
  sender: MailSender;
  intervalMs?: number;
  batchSize?: number;
  backoffBaseMs?: number;
  now?: () => Date;
  onError?: (err: unknown) => void;
}

export function createDispatcher(opts: DispatcherOptions) {
  const { db, sender } = opts;
  const batchSize = opts.batchSize ?? BATCH_SIZE;
  const base = opts.backoffBaseMs ?? BACKOFF_BASE_MS;
  const now = opts.now ?? (() => new Date());
  const onError = opts.onError ?? ((err) => console.error("outbox dispatcher:", describe(err)));

  /** One pass: claim a batch of due rows, send each, record the outcome. Returns how many rows it handled. */
  async function tick(): Promise<number> {
    return db.transaction(async (tx) => {
      const at = now();
      const due = await tx.select().from(notifications)
        .where(and(eq(notifications.status, "pending"), lte(notifications.nextAttemptAt, at)))
        .orderBy(asc(notifications.nextAttemptAt)).limit(batchSize)
        .for("update", { skipLocked: true });
      for (const row of due) {
        try {
          const mail = renderTemplate(row.template, row.payload);
          await sender.send({ to: row.recipientEmail, ...mail });
          await tx.update(notifications).set({ status: "sent", sentAt: at, attempts: row.attempts + 1, lastError: null, updatedAt: at })
            .where(eq(notifications.id, row.id));
        } catch (err) {
          const attempts = row.attempts + 1;
          const failed = err instanceof PermanentMailError || attempts >= MAX_ATTEMPTS;
          await tx.update(notifications).set({
            status: failed ? "failed" : "pending", attempts, lastError: describe(err), updatedAt: at,
            ...(failed ? {} : { nextAttemptAt: new Date(at.getTime() + backoffMs(attempts, base)) }),
          }).where(eq(notifications.id, row.id));
        }
      }
      return due.length;
    });
  }

  let timer: ReturnType<typeof setInterval> | undefined;
  let inflight: Promise<unknown> = Promise.resolve();
  let running = false;

  return {
    tick,
    start() {
      if (timer) return;
      timer = setInterval(() => {
        if (running) return; // never overlap ticks in one process
        running = true;
        inflight = tick().catch(onError).finally(() => { running = false; });
      }, opts.intervalMs ?? 10_000);
      timer.unref(); // the timer alone must not keep the process alive
    },
    /** Stops scheduling and waits for the tick in flight, so closing the DB afterwards is safe. */
    async stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      await inflight;
    },
  };
}

export type Dispatcher = ReturnType<typeof createDispatcher>;
