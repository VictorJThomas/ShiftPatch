import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/** KPI card: label, big tabular number, optional hint. Wrap several in `.stat-grid`. */
export function StatTile({ label, value, icon, hint, testId, tone = "default" }: { label: string; value: ReactNode; icon?: IconName; hint?: string; testId?: string; tone?: "default" | "brand" }) {
  return (
    <div className={`card stat${tone === "brand" ? " stat-brand" : ""}`} data-testid={testId}>
      <div className="l">
        {icon && <Icon name={icon} />}
        {label}
      </div>
      <div className="n">{value}</div>
      {hint && <div className="muted stat-hint">{hint}</div>}
    </div>
  );
}
