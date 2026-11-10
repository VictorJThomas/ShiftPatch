// Template registry for outbox rows (ARCHITECTURE §10). Content: role, date, times, agency, reason, names. Never credential type or
// health data (TB), file names/keys, or links carrying tokens (only the plain APP_ORIGIN footer). Rendering reads only the
// whitelisted payload fields below, so extra payload keys can't leak into mail.

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

type Payload = Record<string, unknown>;

function field(p: Payload, key: string): string {
  const v = p[key];
  if (typeof v !== "string" || v.trim() === "") throw new PermanentMailError(`payload.${key} missing`);
  return v;
}

interface Layout { subject: string; heading: string; intro: string; rows: [string, string][]; outro?: string }

/** One look for every mail (heading + intro + facts + outro; text and HTML carry the same information). Values are escaped / one-lined here, so renderers only pick fields. */
function layout(l: Layout, appUrl?: string): RenderedMail {
  const text = [l.intro, "", ...l.rows.map(([k, v]) => `${k}: ${v}`), ...(l.outro ? ["", l.outro] : []), ...(appUrl ? ["", `Sign in to ShiftPatch: ${appUrl}`] : [])].join("\n");
  const html =
    `<!doctype html><html><body style="font-family:sans-serif;color:#1a1a1a">` +
    `<h2 style="margin:0 0 12px">${escapeHtml(l.heading)}</h2>` +
    `<p>${escapeHtml(l.intro)}</p>` +
    (l.rows.length ? `<table cellpadding="4" style="border-collapse:collapse">${l.rows.map(([k, v]) => `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(v)}</td></tr>`).join("")}</table>` : "") +
    (l.outro ? `<p>${escapeHtml(l.outro)}</p>` : "") +
    (appUrl ? `<p>Sign in to ShiftPatch: <a href="${escapeHtml(appUrl)}">${escapeHtml(appUrl)}</a></p>` : "") +
    `</body></html>`;
  return { subject: oneLine(l.subject), text, html };
}

type Render = (p: Payload, appUrl?: string) => RenderedMail;
const SEE_STATUS = "Sign in to ShiftPatch to see the current status of this shift.";
const RENEW = "Upload a renewed credential in ShiftPatch to keep claiming shifts.";

/** Shared shift facts. `agency` is left out where the recipient is the agency itself. */
const shiftRows = (p: Payload, agency = true): [string, string][] => [
  ["Role", field(p, "role")], ["Date", field(p, "date")], ["Time", `${field(p, "startTime")} - ${field(p, "endTime")}`],
  ...(agency ? [["Agency", field(p, "agencyName")] as [string, string]] : []),
];

const shiftCancelled: Render = (p, appUrl) => {
  const role = field(p, "role"), date = field(p, "date");
  const rawReason = typeof p.reason === "string" ? p.reason : "";
  const reason = REASONS[rawReason] ?? (rawReason || "Not provided");
  return layout({ subject: `Shift cancelled: ${role} on ${date}`, heading: "Shift cancelled", intro: "A shift has been cancelled.", rows: [...shiftRows(p), ["Reason", reason]], outro: SEE_STATUS }, appUrl);
};

const shiftPosted: Render = (p, appUrl) => {
  const facility = typeof p.facilityName === "string" && p.facilityName.trim() ? p.facilityName : null;
  return layout({
    subject: `New ${field(p, "role")} shift on ${field(p, "date")}`, heading: "New shift available", intro: "A new shift matching your role was posted.",
    rows: [...shiftRows(p), ...(facility ? [["Facility", facility] as [string, string]] : [])], outro: "Sign in to ShiftPatch to claim it.",
  }, appUrl);
};

const shiftClaimedAgency: Render = (p, appUrl) => {
  const nurse = field(p, "nurseName");
  return layout({ subject: `${nurse} claimed your ${field(p, "role")} shift on ${field(p, "date")}`, heading: "Shift claimed", intro: `${nurse} claimed one of your shifts.`, rows: shiftRows(p, false), outro: SEE_STATUS }, appUrl);
};

const shiftClaimedNurse: Render = (p, appUrl) =>
  layout({ subject: `You're booked: ${field(p, "role")} on ${field(p, "date")}`, heading: "You're booked", intro: "Your claim was confirmed.", rows: shiftRows(p), outro: SEE_STATUS }, appUrl);

const credentialSubmitted: Render = (p, appUrl) =>
  layout({ subject: "Credential awaiting review", heading: "Credential awaiting review", intro: `${field(p, "nurseName")} uploaded a credential for review.`, rows: [], outro: "Sign in to ShiftPatch to review it." }, appUrl);

const credentialReviewed: Render = (p, appUrl) => {
  const outcome = field(p, "outcome");
  if (outcome !== "verified" && outcome !== "rejected") throw new PermanentMailError("payload.outcome invalid");
  return layout({ subject: `Your credential was ${outcome}`, heading: `Credential ${outcome}`, intro: `An administrator reviewed your credential and it was ${outcome}.`, rows: [], outro: "Sign in to ShiftPatch to see your credentials." }, appUrl);
};

const credentialExpiring: Render = (p, appUrl) => {
  const on = field(p, "expiresOn");
  return layout({ subject: `A credential expires on ${on}`, heading: "Credential expiring soon", intro: "One of your credentials is about to expire.", rows: [["Expires on", on]], outro: RENEW }, appUrl);
};

/** `audience` picks the variant: the nurse sees the date, admins only the nurse's name. */
const credentialExpired: Render = (p, appUrl) => {
  if (p.audience === "nurse") {
    return layout({ subject: "A credential has expired", heading: "Credential expired", intro: "One of your credentials has expired.", rows: [["Expired on", field(p, "expiresOn")]], outro: RENEW }, appUrl);
  }
  if (p.audience === "admin") {
    return layout({ subject: "A credential has expired", heading: "Credential expired", intro: `A credential of ${field(p, "nurseName")} has expired.`, rows: [], outro: "Sign in to ShiftPatch to follow up." }, appUrl);
  }
  throw new PermanentMailError("payload.audience invalid");
};

const nurseLicenseLapses: Render = (p, appUrl) =>
  layout({ subject: `Booked nurse's license lapses before ${field(p, "date")}`, heading: "Booked nurse's license lapses", intro: `The license of ${field(p, "nurseName")} expires before this shift.`, rows: shiftRows(p, false), outro: "Sign in to ShiftPatch to plan coverage." }, appUrl);

const shiftReminder: Render = (p, appUrl) =>
  layout({ subject: `Reminder: ${field(p, "role")} shift ${field(p, "date")} ${field(p, "startTime")}`, heading: "Shift starts within 24 hours", intro: "Your shift starts within 24 hours.", rows: shiftRows(p), outro: SEE_STATUS }, appUrl);

const shiftUnfilled: Render = (p, appUrl) =>
  layout({ subject: `Unfilled: ${field(p, "role")} shift ${field(p, "date")} ${field(p, "startTime")}`, heading: "Shift still unfilled", intro: "A shift starting within 24 hours has not been claimed.", rows: shiftRows(p, false), outro: SEE_STATUS }, appUrl);

const registry: Record<string, Render> = {
  "shift.cancelled": shiftCancelled,
  "shift.posted": shiftPosted,
  "shift.claimed.agency": shiftClaimedAgency,
  "shift.claimed.nurse": shiftClaimedNurse,
  "credential.submitted": credentialSubmitted,
  "credential.reviewed": credentialReviewed,
  "credential.expiring": credentialExpiring,
  "credential.expired": credentialExpired,
  "shift.nurse_license_lapses": nurseLicenseLapses,
  "shift.reminder": shiftReminder,
  "shift.unfilled": shiftUnfilled,
};

export function renderTemplate(template: string, payload: unknown, opts: { appUrl?: string | undefined } = {}): RenderedMail {
  const render = Object.hasOwn(registry, template) ? registry[template] : undefined;
  if (!render) throw new PermanentMailError(`unknown template ${template}`);
  if (typeof payload !== "object" || payload === null) throw new PermanentMailError("payload is not an object");
  return render(payload as Payload, opts.appUrl || undefined);
}
