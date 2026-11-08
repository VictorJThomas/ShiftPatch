"use client";

import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icon";

export const SUCCESS_AUTO_DISMISS_MS = 5000;

interface NotificationBannerProps {
  kind: "success" | "error";
  title: string;
  message?: ReactNode;
  /** Shows the close button. On success it is also called after 5 s. Omit for an inline page banner. */
  onDismiss?: () => void;
  /** Floating toast (shadow) vs inline page banner. */
  toast?: boolean;
  /** Give the banner its live role (`status`/`alert`). The Toaster turns it off for success toasts: its persistent region announces them. */
  live?: boolean;
  /** Default `notification-banner` (spec). The Toaster passes `null` for all but the newest toast, so the ID is never on two nodes. */
  testId?: string | null;
}

/**
 * One component, two variants (design: Toasts). Success = `role="status"`, auto-dismisses after 5 s;
 * error = `role="alert"`, stays until dismissed. Icon + title + message, never colour alone.
 */
export function NotificationBanner({ kind, title, message, onDismiss, toast = true, live = true, testId = "notification-banner" }: NotificationBannerProps) {
  const ok = kind === "success";
  const timed = ok && !!onDismiss;

  useEffect(() => {
    if (!timed) return;
    const timer = setTimeout(onDismiss, SUCCESS_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [timed, onDismiss]);

  return (
    <div className={`banner${toast ? " toast" : ""}${timed ? " has-timer" : ""}`} data-testid={testId ?? undefined}>
      <div className={`alert ${ok ? "al-ok" : "al-err"}`} role={live ? (ok ? "status" : "alert") : undefined}>
        <Icon name={ok ? "check-circle" : "alert-circle"} size="lg" />
        <div style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
          <b>{title}</b>
          {message}
        </div>
        {onDismiss && (
          <button type="button" className="iconbtn" aria-label="Dismiss" onClick={onDismiss}>
            <Icon name="x" />
          </button>
        )}
      </div>
      {timed && (
        <div className="tm al-ok" style={{ "--fg": "var(--st-filled-fg)" } as React.CSSProperties} aria-hidden="true">
          <i />
        </div>
      )}
    </div>
  );
}
