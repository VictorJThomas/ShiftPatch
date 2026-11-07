/** Mask-based icon set from tokens.css (`.i-*`): follows currentColor, decorative by default. */
export type IconName =
  | "check" | "x" | "clock" | "alert" | "alert-circle" | "info" | "check-circle" | "x-circle" | "ban" | "dot" | "flag"
  | "shield" | "cal" | "cal-x" | "pin" | "search" | "upload" | "camera" | "file" | "user" | "brief" | "list" | "idcard"
  | "down" | "right" | "left" | "plus" | "grid" | "eye" | "refresh" | "building" | "phone" | "mail" | "arrow" | "inbox"
  | "lock" | "swap" | "moon" | "logout" | "wifi-off" | "note";

export function Icon({ name, size, className = "" }: { name: IconName; size?: "sm" | "lg"; className?: string }) {
  const sizeClass = size === "sm" ? " ic-sm" : size === "lg" ? " ic-lg" : "";
  return <span className={`ic${sizeClass} i-${name} ${className}`.trim()} aria-hidden="true" />;
}
