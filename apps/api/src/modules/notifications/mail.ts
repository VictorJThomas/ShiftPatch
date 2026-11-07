import { createConnection } from "node:net";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}
export interface MailSender {
  /** Transport name, for logs and tests. */
  readonly name: string;
  send(msg: MailMessage): Promise<void>;
}

const SEND_TIMEOUT_MS = 10_000;
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

/** Dev default: prints metadata only (no body), so `pnpm dev` works with zero mail config. */
export function logSender(log: (line: string) => void = console.log): MailSender {
  return { name: "log", send: async (m) => log(`[mail:log] to=${oneLine(m.to)} subject=${oneLine(m.subject)}`) };
}

/** Resend HTTP API (plain fetch, no SDK). The key goes only in the Authorization header and never into an error message. */
export function resendSender(opts: { apiKey: string; from: string; fetchImpl?: typeof fetch }): MailSender {
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    name: "resend",
    async send(m) {
      const res = await doFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: opts.from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`resend responded ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    },
  };
}

const bareAddress = (from: string) => /<([^>]+)>/.exec(from)?.[1] ?? from;
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/.{1,76}/g, "$&\r\n");

/** Builds the RFC 5322 message: multipart/alternative, UTF-8 bodies base64-encoded, headers forced to one line. */
export function buildMime(from: string, m: MailMessage, boundary = `sp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`) {
  const subjectLine = oneLine(m.subject);
  const subject = /^[\x20-\x7e]*$/.test(subjectLine) ? subjectLine : `=?UTF-8?B?${Buffer.from(subjectLine, "utf8").toString("base64")}?=`;
  return [
    `From: ${oneLine(from)}`, `To: ${oneLine(m.to)}`, `Subject: ${subject}`, `Date: ${new Date().toUTCString()}`, "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`, "",
    `--${boundary}`, 'Content-Type: text/plain; charset="utf-8"', "Content-Transfer-Encoding: base64", "", b64(m.text),
    `--${boundary}`, 'Content-Type: text/html; charset="utf-8"', "Content-Transfer-Encoding: base64", "", b64(m.html),
    `--${boundary}--`, "",
  ].join("\r\n");
}

/**
 * Minimal plain-text SMTP client (no TLS, no AUTH) for the local Mailpit catcher only. Production uses Resend.
 * ponytail: nodemailer would add a dependency for features (TLS/AUTH/pooling) this transport deliberately doesn't offer.
 */
export function smtpSender(opts: { host: string; port: number; from: string }): MailSender {
  return {
    name: "smtp",
    send(m) {
      const data = buildMime(opts.from, m).replace(/^\./gm, ".."); // dot-stuffing
      const rcpt = oneLine(m.to).replace(/[<>]/g, "");
      // [command to send, reply code expected after it]; the first entry is the server greeting.
      const steps: [string | null, number][] = [
        [null, 220], ["HELO shiftpatch.local", 250], [`MAIL FROM:<${bareAddress(oneLine(opts.from))}>`, 250],
        [`RCPT TO:<${rcpt}>`, 250], ["DATA", 354], [`${data}\r\n.`, 250], ["QUIT", 221],
      ];
      return new Promise<void>((resolve, reject) => {
        const socket = createConnection({ host: opts.host, port: opts.port });
        let i = 0, buf = "", done = false;
        const fail = (err: Error) => { if (!done) { done = true; socket.destroy(); reject(err); } };
        socket.setTimeout(SEND_TIMEOUT_MS, () => fail(new Error("smtp timeout")));
        socket.on("error", fail);
        socket.on("close", () => fail(new Error("smtp connection closed early")));
        socket.on("data", (chunk) => {
          buf += chunk.toString("utf8");
          const lines = buf.split("\r\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (/^\d{3}-/.test(line)) continue; // multi-line reply continues
            if (Number(line.slice(0, 3)) !== steps[i]![1]) return fail(new Error(`smtp unexpected reply: ${line.slice(0, 100)}`));
            i++;
            if (i === steps.length) { done = true; socket.end(); return resolve(); }
            socket.write(`${steps[i]![0]}\r\n`);
          }
        });
      });
    },
  };
}

/** Wraps a sender so every mail goes to one inbox (demo/prod: seed addresses are on the undeliverable .example domain). */
export function redirectSender(inner: MailSender, redirectTo: string): MailSender {
  return { name: inner.name, send: (m) => inner.send({ ...m, to: redirectTo }) };
}

/** MAIL_TRANSPORT = smtp | resend | log (default log). Missing or invalid mail config degrades to `log` with a warning; boot never fails. */
export function createMailSender(env: NodeJS.ProcessEnv = process.env, warn: (msg: string) => void = console.warn): MailSender {
  const from = env.MAIL_FROM || env.EMAIL_FROM || "ShiftPatch <no-reply@shiftpatch.local>";
  const transport = (env.MAIL_TRANSPORT || "log").toLowerCase();
  let sender: MailSender;
  if (transport === "resend" && env.RESEND_API_KEY) {
    sender = resendSender({ apiKey: env.RESEND_API_KEY, from });
  } else if (transport === "smtp") {
    const port = Number(env.SMTP_PORT ?? 1025);
    sender = smtpSender({ host: env.SMTP_HOST || "localhost", port: Number.isInteger(port) && port > 0 ? port : 1025, from });
  } else {
    if (transport !== "log") warn(`mail: transport "${transport}" unusable (unknown or missing key); falling back to log`);
    sender = logSender();
  }
  return env.EMAIL_REDIRECT_TO ? redirectSender(sender, env.EMAIL_REDIRECT_TO) : sender;
}
