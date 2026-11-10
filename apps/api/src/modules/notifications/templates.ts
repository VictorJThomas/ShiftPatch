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

/** Status badge tints = the app's `--st-*` tokens (apps/web/src/app/tokens.css, light theme). Label text always shown: never color alone. */
const TONES = {
  open: ["#E3EEFB", "#0F4C8A"], filled: ["#DDF0E6", "#17603A"], cancelled: ["#ECEBE6", "#4A4F4D"], pending: ["#FBEFD0", "#7A4B00"],
  rejected: ["#FBE3DF", "#9A2519"], expired: ["#FDE6D2", "#8A3B05"],
} as const;
type Tone = keyof typeof TONES;

interface Layout { subject: string; heading: string; intro: string; rows: [string, string][]; outro?: string; badge: [Tone, string]; cta: string }

// Brand tokens (tokens.css): ink #14201E/#44514E/#5B6764, brand #0E5A55, on-brand #E8EFEC, paper #F5F4EF, line #DDDBD1.
const FONT = "'Schibsted Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
/** Official logo (light variant = for light backgrounds), served publicly by the web app: apps/web/public/brand/. 273x64 @2x. */
const LOGO_PATH = "/brand/logo-horizontal-light-h32@2x.png";

/**
 * One look for every mail. Text and HTML carry the same information; values are escaped / one-lined here, so renderers only pick fields.
 * Email-safe HTML: tables, inline styles, MSO 600px wrapper, bulletproof button. The logo and button need `appUrl` (APP_ORIGIN);
 * without it (local log transport, tests) the header falls back to a text wordmark and no link is emitted.
 */
function layout(l: Layout, appUrl?: string): RenderedMail {
  const text = [l.intro, "", ...l.rows.map(([k, v]) => `${k}: ${v}`), ...(l.outro ? ["", l.outro] : []), ...(appUrl ? ["", `Sign in to ShiftPatch: ${appUrl}`] : [])].join("\n");
  const url = appUrl ? escapeHtml(appUrl) : "";
  const [badgeBg, badgeFg] = TONES[l.badge[0]];
  const wordmark = `<span style="font-size:22px;line-height:32px;font-weight:500;letter-spacing:-0.02em;color:#14201E">Shift<b style="font-weight:800;color:#0E5A55">Patch</b></span>`;
  const logo = appUrl
    ? `<a href="${url}" style="text-decoration:none"><img src="${escapeHtml(appUrl.replace(/\/+$/, "") + LOGO_PATH)}" width="137" height="32" alt="ShiftPatch" style="display:block;border:0;outline:none;width:137px;height:32px;font-family:${FONT};font-size:22px;font-weight:800;line-height:32px;color:#0E5A55"></a>`
    : wordmark;
  const rows = l.rows.map(([k, v], i) => {
    const line = i ? "border-top:1px solid #DDDBD1;" : "";
    return `<tr><td valign="top" style="${line}padding:12px 16px;width:112px;font-size:13px;line-height:20px;color:#5B6764">${escapeHtml(k)}</td>` +
      `<td valign="top" style="${line}padding:12px 16px 12px 0;font-size:16px;line-height:22px;font-weight:600;color:#14201E;word-break:break-word;overflow-wrap:anywhere">${escapeHtml(v)}</td></tr>`;
  }).join("");
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light"><meta name="format-detection" content="telephone=no,date=no,address=no,email=no"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(l.heading)}</title>` +
    `<style>a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}@media (max-width:620px){.sp-pad{padding:24px 20px!important}}</style></head>` +
    `<body style="margin:0;padding:0;background:#F5F4EF">` +
    `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(l.intro)}${"&zwnj;&nbsp;".repeat(40)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F4EF"><tr><td align="center" style="padding:24px 12px">` +
    `<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;font-family:${FONT};color:#14201E">` +
    `<tr><td style="padding:4px 4px 20px">${logo}</td></tr>` +
    `<tr><td class="sp-pad" style="padding:32px 36px;background:#FFFFFF;border:1px solid #DDDBD1;border-radius:16px">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:4px 12px;border-radius:999px;background:${badgeBg};color:${badgeFg};font-size:13px;line-height:20px;font-weight:700">${escapeHtml(l.badge[1])}</td></tr></table>` +
    `<h1 style="margin:16px 0 8px;font-size:24px;line-height:30px;font-weight:700;letter-spacing:-0.02em;color:#14201E">${escapeHtml(l.heading)}</h1>` +
    `<p style="margin:0;font-size:16px;line-height:24px;color:#44514E">${escapeHtml(l.intro)}</p>` +
    (rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;background:#F5F4EF;border:1px solid #DDDBD1;border-radius:10px;border-collapse:separate">${rows}</table>` : "") +
    (l.outro ? `<p style="margin:24px 0 0;font-size:15px;line-height:22px;color:#44514E">${escapeHtml(l.outro)}</p>` : "") +
    (appUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px"><tr><td bgcolor="#0E5A55" style="padding:13px 24px;border-radius:10px;background:#0E5A55">` +
        `<a href="${url}" style="display:block;font-size:16px;line-height:20px;font-weight:700;color:#E8EFEC;text-decoration:none">${escapeHtml(l.cta)}</a></td></tr></table>` +
        `<p style="margin:16px 0 0;font-size:13px;line-height:20px;color:#5B6764">Button not working? Open <a href="${url}" style="color:#0E5A55;font-weight:600;text-decoration:underline;word-break:break-all">${url}</a></p>`
      : "") +
    `</td></tr>` +
    `<tr><td align="center" style="padding:20px 8px 0;font-size:12px;line-height:18px;color:#5B6764">You're receiving this email because you have a ShiftPatch account.<br>ShiftPatch &middot; Nurse shift marketplace</td></tr>` +
    `</table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
  return { subject: oneLine(l.subject), text, html };
}

type Render = (p: Payload, appUrl?: string) => RenderedMail;
const SEE_STATUS = "Sign in to ShiftPatch to see the current status of this shift.";
const RENEW = "Upload a renewed credential in ShiftPatch to keep claiming shifts.";

/** Shared shift facts. `agency` is left out where the recipient is the agency itself. */
const shiftRows = (p: Payload, agency = true): [string, string][] => [
  ["Date", field(p, "date")], ["Time", `${field(p, "startTime")} - ${field(p, "endTime")}`], ["Role", field(p, "role")],
  ...(agency ? [["Agency", field(p, "agencyName")] as [string, string]] : []),
];

const shiftCancelled: Render = (p, appUrl) => {
  const role = field(p, "role"), date = field(p, "date");
  const rawReason = typeof p.reason === "string" ? p.reason : "";
  const reason = REASONS[rawReason] ?? (rawReason || "Not provided");
  return layout({ subject: `Shift cancelled: ${role} on ${date}`, heading: "Shift cancelled", intro: "A shift has been cancelled.", rows: [...shiftRows(p), ["Reason", reason]], outro: SEE_STATUS, badge: ["cancelled", "Cancelled"], cta: "View shifts" }, appUrl);
};

const shiftPosted: Render = (p, appUrl) => {
  const facility = typeof p.facilityName === "string" && p.facilityName.trim() ? p.facilityName : null;
  return layout({
    subject: `New ${field(p, "role")} shift on ${field(p, "date")}`, heading: "New shift available", intro: "A new shift matching your role was posted.",
    rows: [...shiftRows(p), ...(facility ? [["Facility", facility] as [string, string]] : [])], outro: "Sign in to ShiftPatch to claim it.", badge: ["open", "New shift"], cta: "Claim this shift",
  }, appUrl);
};

const shiftClaimedAgency: Render = (p, appUrl) => {
  const nurse = field(p, "nurseName");
  return layout({ subject: `${nurse} claimed your ${field(p, "role")} shift on ${field(p, "date")}`, heading: "Shift claimed", intro: `${nurse} claimed one of your shifts.`, rows: shiftRows(p, false), outro: SEE_STATUS, badge: ["filled", "Filled"], cta: "View shift" }, appUrl);
};

const shiftClaimedNurse: Render = (p, appUrl) =>
  layout({ subject: `You're booked: ${field(p, "role")} on ${field(p, "date")}`, heading: "You're booked", intro: "Your claim was confirmed.", rows: shiftRows(p), outro: SEE_STATUS, badge: ["filled", "Booked"], cta: "View my shifts" }, appUrl);

const credentialSubmitted: Render = (p, appUrl) =>
  layout({ subject: "Credential awaiting review", heading: "Credential awaiting review", intro: `${field(p, "nurseName")} uploaded a credential for review.`, rows: [], outro: "Sign in to ShiftPatch to review it.", badge: ["pending", "Review needed"], cta: "Review credential" }, appUrl);

const credentialReviewed: Render = (p, appUrl) => {
  const outcome = field(p, "outcome");
  if (outcome !== "verified" && outcome !== "rejected") throw new PermanentMailError("payload.outcome invalid");
  return layout({ subject: `Your credential was ${outcome}`, heading: `Credential ${outcome}`, intro: `An administrator reviewed your credential and it was ${outcome}.`, rows: [], outro: "Sign in to ShiftPatch to see your credentials.", badge: outcome === "verified" ? ["filled", "Verified"] : ["rejected", "Rejected"], cta: "View my credentials" }, appUrl);
};

const credentialExpiring: Render = (p, appUrl) => {
  const on = field(p, "expiresOn");
  return layout({ subject: `A credential expires on ${on}`, heading: "Credential expiring soon", intro: "One of your credentials is about to expire.", rows: [["Expires on", on]], outro: RENEW, badge: ["pending", "Expiring soon"], cta: "Upload renewal" }, appUrl);
};

/** `audience` picks the variant: the nurse sees the date, admins only the nurse's name. */
const credentialExpired: Render = (p, appUrl) => {
  if (p.audience === "nurse") {
    return layout({ subject: "A credential has expired", heading: "Credential expired", intro: "One of your credentials has expired.", rows: [["Expired on", field(p, "expiresOn")]], outro: RENEW, badge: ["expired", "Expired"], cta: "Upload renewal" }, appUrl);
  }
  if (p.audience === "admin") {
    return layout({ subject: "A credential has expired", heading: "Credential expired", intro: `A credential of ${field(p, "nurseName")} has expired.`, rows: [], outro: "Sign in to ShiftPatch to follow up.", badge: ["expired", "Expired"], cta: "Open ShiftPatch" }, appUrl);
  }
  throw new PermanentMailError("payload.audience invalid");
};

const nurseLicenseLapses: Render = (p, appUrl) =>
  layout({ subject: `Booked nurse's license lapses before ${field(p, "date")}`, heading: "Booked nurse's license lapses", intro: `The license of ${field(p, "nurseName")} expires before this shift.`, rows: shiftRows(p, false), outro: "Sign in to ShiftPatch to plan coverage.", badge: ["rejected", "Coverage at risk"], cta: "Plan coverage" }, appUrl);

const shiftReminder: Render = (p, appUrl) =>
  layout({ subject: `Reminder: ${field(p, "role")} shift ${field(p, "date")} ${field(p, "startTime")}`, heading: "Shift starts within 24 hours", intro: "Your shift starts within 24 hours.", rows: shiftRows(p), outro: SEE_STATUS, badge: ["open", "Starts soon"], cta: "View shift" }, appUrl);

const shiftUnfilled: Render = (p, appUrl) =>
  layout({ subject: `Unfilled: ${field(p, "role")} shift ${field(p, "date")} ${field(p, "startTime")}`, heading: "Shift still unfilled", intro: "A shift starting within 24 hours has not been claimed.", rows: shiftRows(p, false), outro: SEE_STATUS, badge: ["pending", "Unfilled"], cta: "View shift" }, appUrl);

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
