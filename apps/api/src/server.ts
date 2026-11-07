import { buildApp } from "./app.js";
import { createDb } from "./db/client.js";
import { createDispatcher } from "./modules/notifications/dispatcher.js";
import { createMailSender } from "./modules/notifications/mail.js";

const port = Number(process.env.PORT ?? 3001);
const app = buildApp({ logger: true });

// Outbox dispatcher lives here, not in buildApp, so tests stay deterministic. OUTBOX_DISPATCHER=off disables it (e.g. extra replicas).
if (process.env.OUTBOX_DISPATCHER !== "off" && process.env.DATABASE_URL) {
  const conn = createDb(process.env.DATABASE_URL);
  const interval = Number(process.env.OUTBOX_INTERVAL_MS);
  const sender = createMailSender(process.env, (msg) => app.log.warn(msg));
  const dispatcher = createDispatcher({
    db: conn.db, sender, ...(Number.isFinite(interval) && interval >= 100 ? { intervalMs: interval } : {}),
    onError: (err) => app.log.error({ err }, "outbox dispatcher tick failed"),
  });
  dispatcher.start();
  app.log.info(`outbox dispatcher started (mail transport: ${sender.name})`);
  app.addHook("onClose", async () => {
    await dispatcher.stop();
    await conn.sql.end();
  });
}

app
  .listen({ host: "0.0.0.0", port })
  .then(() => console.log(`ShiftPatch API listening on http://localhost:${port}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
