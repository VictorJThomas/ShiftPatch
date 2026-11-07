/** Cross-tab "signed out" signal. No-op where BroadcastChannel does not exist (old browsers, SSR, jsdom). */
const NAME = "sp-session";

let channel: BroadcastChannel | null | undefined;
function get(): BroadcastChannel | null {
  if (channel === undefined) channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(NAME);
  return channel;
}

export function broadcastSignedOut(): void {
  try {
    get()?.postMessage("signed-out");
  } catch {
    // best effort
  }
}

export function onSignedOutElsewhere(handler: () => void): () => void {
  const ch = get();
  if (!ch) return () => {};
  const listener = (e: MessageEvent) => {
    if (e.data === "signed-out") handler();
  };
  ch.addEventListener("message", listener);
  return () => ch.removeEventListener("message", listener);
}
