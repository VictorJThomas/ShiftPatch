/**
 * Cross-tab session signals: "signed out" and "fresh access token". No-op where BroadcastChannel does not exist
 * (old browsers, SSR).
 *
 * Trade-off (QA-006): the access token travels over BroadcastChannel so a tab about to refresh can adopt the one
 * another tab just obtained instead of rotating the refresh token again (each rotation costs the family's rate limit).
 * BroadcastChannel is same-origin only, and same-origin script can already read the in-memory token, so this adds no
 * new reader. The refresh token is httpOnly and is never broadcast.
 */
const NAME = "sp-session";

let channel: BroadcastChannel | null | undefined;
function get(): BroadcastChannel | null {
  if (channel === undefined) channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(NAME);
  return channel;
}

function post(message: unknown): void {
  try {
    get()?.postMessage(message);
  } catch {
    // best effort
  }
}

function listen(handler: (data: unknown) => void): () => void {
  const ch = get();
  if (!ch) return () => {};
  const listener = (e: MessageEvent) => handler(e.data);
  ch.addEventListener("message", listener);
  return () => ch.removeEventListener("message", listener);
}

export function broadcastSignedOut(): void {
  post("signed-out");
}

export function onSignedOutElsewhere(handler: () => void): () => void {
  return listen((data) => {
    if (data === "signed-out") handler();
  });
}

export interface SharedToken {
  token: string;
  user: unknown; // untrusted until the receiver validates it
}

export function broadcastToken(token: string, user: unknown): void {
  post({ type: "token", token, user });
}

export function onTokenShared(handler: (shared: SharedToken) => void): () => void {
  return listen((data) => {
    if (data && typeof data === "object" && "type" in data && data.type === "token" && "token" in data && typeof data.token === "string") {
      handler({ token: data.token, user: "user" in data ? data.user : undefined });
    }
  });
}
