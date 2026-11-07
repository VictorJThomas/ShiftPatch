import { Icon, type IconName } from "./Icon";

export type Status = "open" | "filled" | "cancelled" | "completed" | "pending" | "verified" | "rejected" | "expired";

const ICONS: Record<Status, IconName> = {
  open: "dot",
  filled: "check-circle",
  cancelled: "ban",
  completed: "check",
  pending: "clock",
  verified: "shield",
  rejected: "x-circle",
  expired: "alert",
};

/** Status pill: icon + label + tint (never colour alone). Cancelled label is struck through. */
export function StatusBadge({ status, testId }: { status: Status; testId?: string }) {
  const label = status[0]!.toUpperCase() + status.slice(1);
  return (
    <span className={`badge b-${status}`} data-testid={testId}>
      <Icon name={ICONS[status]} />
      {status === "cancelled" ? <span className="lbl-s">{label}</span> : label}
    </span>
  );
}
