"use client";

import { useToastStore } from "@/stores/toasts";
import { NotificationBanner } from "./NotificationBanner";

/** Fixed stack: top of the screen on mobile, top-right (24 px inset, max 420 px) on desktop. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div className="toaster">
      {toasts.map((t) => (
        <NotificationBanner key={t.id} kind={t.kind} title={t.title} message={t.message} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}
