// Outbox dispatcher against a real throwaway Postgres, with an in-memory fake sender; plus templates and transport selection.
import { createServer } from "node:net";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { notifications } from "../../db/schema/index.js";
import { createTestDb } from "../../db/test-db.js";
import { backoffMs, createDispatcher, MAX_ATTEMPTS } from "./dispatcher.js";
import { buildMime, createMailSender, type MailMessage, type MailSender, resendSender, smtpSender } from "./mail.js";
import { renderTemplate } from "./templates.js";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t?.drop(); });
beforeEach(async () => { await t.db.delete(notifications); });

const payload = { shiftId: "s1", date: "2026-12-05", startTime: "07:00", endTime: "19:00", role: "RN", agencyName: "Sunrise Health Staffing", reason: "no-show" };
let seq = 0;
// Rows are due one minute ago unless a test says otherwise. Relying on the column default (Postgres now(), microseconds) races the
// dispatcher's JS clock (milliseconds, truncated): a row inserted in the same millisecond as tick() is still "in the future".
const enqueue = async (over: Partial<typeof notifications.$inferInsert> = {}) => {
  const id = `ntf_${++seq}`;
  await t.db.insert(notifications).values({
    id, recipientEmail: `r${seq}@example.com`, template: "shift.cancelled", payload, nextAttemptAt: new Date(Date.now() - 60_000), ...over,
  });
  return id;
};
const row = async (id: string) => (await t.db.select().from(notifications).where(eq(notifications.id, id)))[0]!;

function fakeSender(fail: (m: MailMessage, n: number) => boolean = () => false) {
  const sent: MailMessage[] = [];
  let calls = 0;
  const sender: MailSender = {
    name: "fake",
    async send(m) {
      await new Promise((r) => setTimeout(r, 20)); // widen the race window for the concurrency test
      if (fail(m, ++calls)) throw new Error("smtp down");
      sent.push(m);
    },
  };
  return { sender, sent, calls: () => calls };
}

describe("outbox dispatcher", () => {
  it("sends due pending rows and marks them sent; leaves future rows alone", async () => {
    const a = await enqueue(), b = await enqueue();
    const later = await enqueue({ nextAttemptAt: new Date(Date.now() + 3_600_000) });
    const f = fakeSender();
    expect(await createDispatcher({ db: t.db, sender: f.sender }).tick()).toBe(2);
    expect(f.sent.map((m) => m.to).sort()).toEqual([(await row(a)).recipientEmail, (await row(b)).recipientEmail].sort());
    for (const id of [a, b]) expect(await row(id)).toMatchObject({ status: "sent", attempts: 1, lastError: null }); // sentAt set below
    expect((await row(a)).sentAt).toBeInstanceOf(Date);
    expect(await row(later)).toMatchObject({ status: "pending", attempts: 0 });
    expect(await createDispatcher({ db: t.db, sender: f.sender }).tick()).toBe(0); // sent rows are never picked again
    expect(f.sent).toHaveLength(2);
  });

  it("failure: attempts+1, exponential backoff, last error kept; retried only once due", async () => {
    const id = await enqueue();
    const f = fakeSender(() => true);
    const t0 = new Date("2030-01-01T00:00:00Z");
    let clock = t0;
    const d = createDispatcher({ db: t.db, sender: f.sender, now: () => clock });
    await t.db.update(notifications).set({ nextAttemptAt: t0 }).where(eq(notifications.id, id));

    await d.tick();
    let r = await row(id);
    expect(r).toMatchObject({ status: "pending", attempts: 1, lastError: "smtp down" });
    expect(r.nextAttemptAt.getTime()).toBe(t0.getTime() + backoffMs(1));
    expect(backoffMs(1)).toBe(30_000);
    expect([1, 2, 3, 4].map((n) => backoffMs(n))).toEqual([30_000, 60_000, 120_000, 240_000]);

    expect(await d.tick()).toBe(0); // not due yet
    clock = new Date(t0.getTime() + backoffMs(1));
    await d.tick();
    r = await row(id);
    expect(r.attempts).toBe(2);
    expect(r.nextAttemptAt.getTime()).toBe(clock.getTime() + backoffMs(2));
  });

  it("goes failed after 5 attempts, truncates the error, and stops retrying", async () => {
    const id = await enqueue();
    const f = fakeSender(() => { throw new Error(`boom ${"x".repeat(2000)}`); });
    let clock = new Date("2030-01-01T00:00:00Z");
    await t.db.update(notifications).set({ nextAttemptAt: clock }).where(eq(notifications.id, id));
    const d = createDispatcher({ db: t.db, sender: f.sender, now: () => clock });
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await d.tick();
      clock = new Date(clock.getTime() + 24 * 3_600_000);
    }
    const r = await row(id);
    expect(r).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
    expect(r.lastError!.length).toBeLessThanOrEqual(500);
    expect(await d.tick()).toBe(0);
    expect(f.calls()).toBe(MAX_ATTEMPTS);
  });

  it("unknown template or malformed payload fails immediately, without a send", async () => {
    const a = await enqueue({ template: "nope" }), b = await enqueue({ payload: { role: "RN" } });
    const f = fakeSender();
    await createDispatcher({ db: t.db, sender: f.sender }).tick();
    expect(f.calls()).toBe(0);
    for (const id of [a, b]) expect(await row(id)).toMatchObject({ status: "failed", attempts: 1 });
  });

  it("one bad row does not block the rest of the batch", async () => {
    const bad = await enqueue({ recipientEmail: "bad@example.com" }), good = await enqueue();
    const f = fakeSender((m) => m.to === "bad@example.com");
    await createDispatcher({ db: t.db, sender: f.sender }).tick();
    expect((await row(bad)).status).toBe("pending");
    expect((await row(good)).status).toBe("sent");
  });

  it("respects the batch size", async () => {
    for (let i = 0; i < 5; i++) await enqueue();
    const f = fakeSender();
    expect(await createDispatcher({ db: t.db, sender: f.sender, batchSize: 3 }).tick()).toBe(3);
    expect(f.sent).toHaveLength(3);
  });

  it("two dispatchers racing: every row is sent exactly once", async () => {
    for (let i = 0; i < 12; i++) await enqueue();
    const f = fakeSender();
    const ds = [createDispatcher({ db: t.db, sender: f.sender, batchSize: 5 }), createDispatcher({ db: t.db, sender: f.sender, batchSize: 5 })];
    const handled = await Promise.all([...ds, ...ds].map((d) => d.tick()));
    await Promise.all(ds.map((d) => d.tick())); // sweep leftovers
    expect(handled.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    const tos = f.sent.map((m) => m.to);
    expect(new Set(tos).size).toBe(tos.length); // no duplicate
    expect(tos).toHaveLength(12);
    expect((await t.db.select().from(notifications)).every((r) => r.status === "sent" && r.attempts === 1)).toBe(true);
  });

  it("claim leases the row: sending + locked_until, attempts counted before the send", async () => {
    const id = await enqueue();
    let seen: Awaited<ReturnType<typeof row>> | undefined;
    const sender: MailSender = { name: "spy", send: async () => { seen = await row(id); } };
    const at = new Date("2030-01-01T00:00:00Z");
    await t.db.update(notifications).set({ nextAttemptAt: at }).where(eq(notifications.id, id));
    await createDispatcher({ db: t.db, sender, now: () => at, leaseMs: 60_000 }).tick();
    expect(seen).toMatchObject({ status: "sending", attempts: 1 });
    expect(seen!.lockedUntil!.getTime()).toBe(at.getTime() + 60_000);
    expect(await row(id)).toMatchObject({ status: "sent", lockedUntil: null });
  });

  it("crash after claim: row is reclaimed only after the lease, and the lost attempt counts", async () => {
    const at = new Date("2030-01-01T00:00:00Z");
    const id = await enqueue();
    await t.db.update(notifications).set({ status: "sending", attempts: 2, lockedUntil: new Date(at.getTime() + 1000), nextAttemptAt: at }).where(eq(notifications.id, id));
    const f = fakeSender();
    const d = createDispatcher({ db: t.db, sender: f.sender, now: () => at });
    expect(await d.tick()).toBe(0); // lease still held by the (possibly alive) claimer
    expect(f.calls()).toBe(0);
    const d2 = createDispatcher({ db: t.db, sender: f.sender, now: () => new Date(at.getTime() + 2000) });
    expect(await d2.tick()).toBe(1);
    expect(await row(id)).toMatchObject({ status: "sent", attempts: 3 });
  });

  it("expired lease with no attempts left goes failed without another send", async () => {
    const at = new Date("2030-01-01T00:00:00Z");
    const id = await enqueue();
    await t.db.update(notifications).set({ status: "sending", attempts: MAX_ATTEMPTS, lockedUntil: new Date(at.getTime() - 1), nextAttemptAt: at }).where(eq(notifications.id, id));
    const f = fakeSender();
    await createDispatcher({ db: t.db, sender: f.sender, now: () => at }).tick();
    expect(f.calls()).toBe(0);
    expect(await row(id)).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
  });

  it("outcome write fails every time: mails are bounded by MAX_ATTEMPTS, never re-sent forever", async () => {
    await t.sql.unsafe(`CREATE FUNCTION block_sent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.status IN ('sent') THEN RAISE EXCEPTION 'outcome write blocked'; END IF; RETURN NEW; END $$`);
    await t.sql.unsafe(`CREATE TRIGGER block_sent BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION block_sent()`);
    try {
      const id = await enqueue();
      const f = fakeSender();
      const errors: unknown[] = [];
      let clock = new Date("2030-01-01T00:00:00Z");
      await t.db.update(notifications).set({ nextAttemptAt: clock }).where(eq(notifications.id, id));
      const d = createDispatcher({ db: t.db, sender: f.sender, now: () => clock, leaseMs: 1000, onError: (e) => errors.push(e) });
      for (let i = 0; i < 12; i++) { await d.tick(); clock = new Date(clock.getTime() + 5000); }
      expect(f.calls()).toBe(MAX_ATTEMPTS);
      expect(errors).toHaveLength(MAX_ATTEMPTS);
      expect(await row(id)).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
    } finally {
      await t.sql.unsafe(`DROP TRIGGER block_sent ON notifications; DROP FUNCTION block_sent()`);
    }
  });

  it("start() drains on the interval; stop() halts it", async () => {
    const f = fakeSender();
    const d = createDispatcher({ db: t.db, sender: f.sender, intervalMs: 30 });
    const id = await enqueue();
    d.start();
    d.start(); // idempotent
    await expect.poll(async () => (await row(id)).status, { timeout: 3000 }).toBe("sent");
    await d.stop();
    const before = f.sent.length;
    const later = await enqueue();
    await new Promise((r) => setTimeout(r, 150));
    expect((await row(later)).status).toBe("pending");
    expect(f.sent.length).toBe(before);
  });
});

describe("templates", () => {
  it("shift.cancelled renders subject, text and html from the payload", () => {
    const m = renderTemplate("shift.cancelled", { ...payload, claimedBy: "usr_secret", licenseNumber: "RN-123" });
    expect(m.subject).toBe("Shift cancelled: RN on 2026-12-05");
    for (const s of ["RN", "2026-12-05", "07:00 - 19:00", "Sunrise Health Staffing", "no-show"]) expect(m.text.toLowerCase()).toContain(s.toLowerCase());
    expect(m.html).toContain("<table");
    for (const out of [m.subject, m.text, m.html]) expect(out).not.toMatch(/usr_secret|RN-123|https?:\/\//); // whitelisted fields only, no links
  });

  it("escapes HTML and keeps the subject on one line", () => {
    const m = renderTemplate("shift.cancelled", { ...payload, agencyName: `<script>alert("x")</script> & Co`, role: "RN\r\nBcc: evil@example.com", reason: `<img src=x onerror=1>` });
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("<img");
    expect(m.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Co");
    expect(m.subject).not.toMatch(/[\r\n]/);
  });

  it("rejects unknown templates (incl. prototype keys) and missing fields", () => {
    expect(() => renderTemplate("nope", payload)).toThrow(/unknown template/);
    expect(() => renderTemplate("constructor", payload)).toThrow(/unknown template/);
    expect(() => renderTemplate("shift.cancelled", { role: "RN" })).toThrow(/missing/);
    expect(() => renderTemplate("shift.cancelled", null)).toThrow();
  });
});

describe("mail transports", () => {
  const noWarn = () => {};
  it("selects by MAIL_TRANSPORT; defaults to log; never throws on bad config", () => {
    expect(createMailSender({}, noWarn).name).toBe("log");
    expect(createMailSender({ MAIL_TRANSPORT: "smtp" }, noWarn).name).toBe("smtp");
    expect(createMailSender({ MAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_x" }, noWarn).name).toBe("resend");
    const warnings: string[] = [];
    expect(createMailSender({ MAIL_TRANSPORT: "resend" }, (w) => warnings.push(w)).name).toBe("log"); // no key
    expect(createMailSender({ MAIL_TRANSPORT: "carrier-pigeon" }, (w) => warnings.push(w)).name).toBe("log");
    expect(createMailSender({ MAIL_TRANSPORT: "smtp", SMTP_PORT: "abc" }, noWarn).name).toBe("smtp");
    expect(warnings).toHaveLength(2);
    expect(warnings.join()).not.toContain("re_x");
  });

  it("EMAIL_REDIRECT_TO reroutes every message", async () => {
    const seen: string[] = [];
    const orig = console.log;
    console.log = (l: string) => seen.push(l);
    try {
      await createMailSender({ EMAIL_REDIRECT_TO: "inbox@example.org" }, noWarn).send({ to: "a@example.com", subject: "s", text: "t", html: "h" });
    } finally { console.log = orig; }
    expect(seen[0]).toContain("to=inbox@example.org");
    expect(seen[0]).toContain("[to: a@example.com] s");
  });

  it("without EMAIL_REDIRECT_TO the subject is unchanged", async () => {
    const seen: string[] = [];
    const orig = console.log;
    console.log = (l: string) => seen.push(l);
    try {
      await createMailSender({}, noWarn).send({ to: "a@example.com", subject: "s", text: "t", html: "h" });
    } finally { console.log = orig; }
    expect(seen[0]).not.toContain("[to:");
  });

  it("resend: POSTs JSON with a bearer key; an error response throws without leaking the key", async () => {
    let req: { url: string; init: RequestInit } | undefined;
    const ok = resendSender({ apiKey: "re_secret", from: "A <a@x.test>", fetchImpl: async (url, init) => { req = { url: String(url), init: init! }; return new Response("{}", { status: 200 }); } });
    await ok.send({ to: "b@example.com", subject: "S", text: "T", html: "<p>H</p>" });
    expect(req!.url).toBe("https://api.resend.com/emails");
    expect((req!.init.headers as Record<string, string>).authorization).toBe("Bearer re_secret");
    expect(JSON.parse(req!.init.body as string)).toMatchObject({ from: "A <a@x.test>", to: ["b@example.com"], subject: "S" });
    const bad = resendSender({ apiKey: "re_secret", from: "a@x.test", fetchImpl: async () => new Response("rate limited", { status: 429 }) });
    await expect(bad.send({ to: "b@example.com", subject: "S", text: "T", html: "H" })).rejects.toThrow(/429.*rate limited/);
    await expect(bad.send({ to: "b@example.com", subject: "S", text: "T", html: "H" })).rejects.not.toThrow(/re_secret/);
  });

  it("smtp: speaks SMTP to a local server and delivers the MIME message", async () => {
    const got: string[] = [];
    const server = createServer((s) => {
      let inData = false, data = "";
      s.write("220 hi\r\n");
      s.on("data", (c) => {
        const text = c.toString();
        if (inData) {
          data += text;
          if (data.endsWith("\r\n.\r\n")) { inData = false; got.push(data); s.write("250 queued\r\n"); }
          return;
        }
        for (const line of text.split("\r\n").filter(Boolean)) {
          got.push(line);
          if (line === "DATA") { inData = true; data = ""; s.write("354 go\r\n"); }
          else if (line === "QUIT") { s.write("221 bye\r\n"); s.end(); }
          else s.write("250 ok\r\n");
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    try {
      const port = (server.address() as { port: number }).port;
      await smtpSender({ host: "127.0.0.1", port, from: "ShiftPatch <no-reply@shiftpatch.local>" })
        .send({ to: "n@example.com", subject: "Shift cancelled: RN", text: "plain body", html: "<p>html body</p>" });
      expect(got).toContain("MAIL FROM:<no-reply@shiftpatch.local>");
      expect(got).toContain("RCPT TO:<n@example.com>");
      const body = got.find((g) => g.includes("multipart/alternative"))!;
      expect(body).toContain("Subject: Shift cancelled: RN");
      expect(Buffer.from(body.split("\r\n\r\n")[2]!.split("\r\n")[0]!, "base64").toString()).toBe("plain body");
    } finally { server.close(); }
  });

  it("smtp: connection refused rejects (becomes a retry in the dispatcher)", async () => {
    await expect(smtpSender({ host: "127.0.0.1", port: 1, from: "a@x.test" }).send({ to: "b@example.com", subject: "S", text: "T", html: "H" })).rejects.toThrow();
  });

  it("buildMime forces header values onto one line", () => {
    const m = buildMime("A <a@x.test>", { to: "b@example.com\r\nBcc: evil@example.com", subject: "Hi\r\nBcc: evil@example.com", text: "t", html: "h" });
    expect(m.split("\r\n").some((l) => l.startsWith("Bcc:"))).toBe(false);
  });
});
