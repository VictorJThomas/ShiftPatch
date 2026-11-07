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
}

/**
 * One component, two variants (design: Toasts). Success = `role="status"`, auto-dismisses after 5 s;
 * error = `role="alert"`, stays until dismissed. Icon + title + message, never colour alone.
 */
export function NotificationBanner({ kind, title, message, onDismiss, toast = true }: NotificationBannerProps) {
  const ok = kind === "success";
  const timed = ok && !!onDismiss;

  useEffect(() => {
    if (!timed) return;
    const timer = setTimeout(onDismiss, SUCCESS_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [timed, onDismiss]);

  return (
    <div className={`banner${toast ? " toast" : ""}${timed ? " has-timer" : ""}`} data-testid="notification-banner">
      <div className={`alert ${ok ? "al-ok" : "al-err"}`} role={ok ? "status" : "alert"}>
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
