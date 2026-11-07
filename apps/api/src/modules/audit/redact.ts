// One redaction rule for both directions: applied before an audit row is written AND before one is returned (rows written
// by an older writer, or a future one that forgets, still never leak). ARCHITECTURE §11: passwords, tokens, file keys, links.

// Matched on the key's camelCase / snake_case words, so `linkedShiftId` is kept but `downloadUrl`, `s3Key`, `objectKeys`, `file_path` go.
const SENSITIVE_WORDS = new Set(["url", "urls", "uri", "link", "key", "keys", "path", "bucket", "hash", "otp", "ssn", "pin", "cookie", "signature", "authorization"]);
const SENSITIVE_SUBSTRING = /pass(word|wd|code)|secret|token|apikey|authori[sz]ation/i; // single-word spellings: passwordHash, accesstoken, apikey
const words = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/);
const isSensitiveKey = (key: string) => SENSITIVE_SUBSTRING.test(key) || /(key|url)$/i.test(key) || words(key).some((w) => SENSITIVE_WORDS.has(w));
const URL_VALUE = /^[a-z][a-z0-9+.-]*:\/\//i;
const JWT_VALUE = /^eyJ[\w-]+\.[\w-]+\.[\w-]*$/;

function scrub(value: unknown, depth: number): unknown {
  if (typeof value === "string") return URL_VALUE.test(value) || JWT_VALUE.test(value) ? "[redacted]" : value;
  if (Array.isArray(value)) return depth > 6 ? "[redacted]" : value.map((v) => scrub(v, depth + 1));
  if (value && typeof value === "object") {
    if (depth > 6) return "[redacted]";
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "__proto__" || isSensitiveKey(k)) continue; // `__proto__` from jsonb would set the prototype, not a key
      out[k] = scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** `{ field: [before, after] }` without sensitive fields. Anything that is not a plain object becomes null. */
export function redactChanges(changes: unknown): Record<string, unknown> | null {
  if (changes === null || changes === undefined || typeof changes !== "object" || Array.isArray(changes)) return null;
  return scrub(changes, 0) as Record<string, unknown>;
}
