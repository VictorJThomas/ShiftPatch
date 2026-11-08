"use client";

import { useState } from "react";
import { useOpenDialogs } from "@/stores/dialogs";
import { useToastStore, type Toast } from "@/stores/toasts";
import { NotificationBanner } from "./NotificationBanner";

/**
 * Fixed stack: top of the screen on mobile, top-right (24 px inset, max 420 px) on desktop.
 *
 * QA-003: a live region created together with its content is often missed by screen readers, so the
 * container and one visually hidden `role="status"` region are always mounted. Success toasts are
 * announced only by that region (their visible banner gets no role, so nothing is read twice);
 * error toasts keep `role="alert"` on the banner, which is announced on insertion.
 *
 * Modal dialogs: `showModal()` makes everything outside the dialog inert, so a page-level toast would sit
 * under the scrim, unclickable and unannounced. While a dialog is open, the page Toaster shows nothing and
 * the dialog renders `<Toaster inline />` inside itself.
 *
 * Only the NEWEST banner carries `data-testid="notification-banner"`: older ones may still be visible
 * (success lasts 5 s, errors until dismissed), and a test ID on two nodes breaks strict locators.
 */
export function Toaster({ inline = false }: { inline?: boolean }) {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const dialogOpen = useOpenDialogs((s) => s.count > 0);
  const active = inline || !dialogOpen;

  // Latest success ever pushed (ids only grow). Adjusted during render, so dismissing a newer toast
  // never brings an older message back into the region (no re-announcement).
  const [announced, setAnnounced] = useState<Toast>();
  const latest = toasts.findLast((t) => t.kind === "success");
  if (active && latest && latest.id > (announced?.id ?? 0)) setAnnounced(latest);

  const newestId = toasts.at(-1)?.id;
  return (
    <div className={inline ? "toaster toaster-inline" : "toaster"}>
      <div className="sr" role="status" aria-live="polite" aria-atomic="true">
        {/* Keyed node: a repeated identical message is a new node, so it is announced again. */}
        {active && announced && <span key={announced.id}>{`Success: ${announced.title}${announced.message ? `. ${announced.message}` : ""}`}</span>}
      </div>
      {active &&
        toasts.map((t) => (
          <NotificationBanner
            key={t.id}
            kind={t.kind}
            title={t.title}
            message={t.message}
            live={t.kind === "error"}
            testId={t.id === newestId ? "notification-banner" : null}
            onDismiss={() => dismiss(t.id)}
          />
        ))}
    </div>
  );
}
