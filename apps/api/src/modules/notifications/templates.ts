// Template registry for outbox rows (ARCHITECTURE §10). Content: role, date, times, agency, reason. Never credential or health data,
// never links carrying tokens. Rendering reads only the whitelisted payload fields below, so extra payload keys can't leak into mail.

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

/** Thrown for a row that can never succeed (unknown template, malformed payload): the dispatcher fails it without retrying. */
export class PermanentMailError extends Error {}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
/** Header values must be one line: strip CR/LF so payload text can't inject headers. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

const REASONS: Record<string, string> = { "no-show": "Short notice (no-show)", advance: "Advance notice" };

function field(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  if (typeof v !== "string" || v.trim() === "") throw new PermanentMailError(`payload.${key} missing`);
  return v;
}

function shiftCancelled(payload: unknown): RenderedMail {
  if (typeof payload !== "object" || payload === null) throw new PermanentMailError("payload is not an object");
  const p = payload as Record<string, unknown>;
  const role = field(p, "role"), date = field(p, "date"), start = field(p, "startTime"), end = field(p, "endTime"), agency = field(p, "agencyName");
  const rawReason = typeof p.reason === "string" ? p.reason : "";
  const reason = REASONS[rawReason] ?? (rawReason || "Not provided");

  const lines: [string, string][] = [["Role", role], ["Date", date], ["Time", `${start} - ${end}`], ["Agency", agency], ["Reason", reason]];
  const subject = oneLine(`Shift cancelled: ${role} on ${date}`);
  const text = ["A shift has been cancelled.", "", ...lines.map(([k, v]) => `${k}: ${v}`), "", "Sign in to ShiftPatch to see the current status of this shift."].join("\n");
  const html =
    `<!doctype html><html><body style="font-family:sans-serif;color:#1a1a1a">` +
    `<h2 style="margin:0 0 12px">Shift cancelled</h2>` +
    `<table cellpadding="4" style="border-collapse:collapse">` +
    lines.map(([k, v]) => `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(v)}</td></tr>`).join("") +
    `</table><p>Sign in to ShiftPatch to see the current status of this shift.</p></body></html>`;
  return { subject, text, html };
}

const registry: Record<string, (payload: unknown) => RenderedMail> = {
  "shift.cancelled": shiftCancelled,
};

export function renderTemplate(template: string, payload: unknown): RenderedMail {
  const render = Object.hasOwn(registry, template) ? registry[template] : undefined;
  if (!render) throw new PermanentMailError(`unknown template ${template}`);
  return render(payload);
}
