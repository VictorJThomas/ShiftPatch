import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export interface DetailItem {
  label: string;
  value: ReactNode;
  icon?: IconName;
}

/** Label/value pairs as a `<dl>`. Entries with an empty value are skipped. */
export function DetailList({ items, className = "" }: { items: DetailItem[]; className?: string }) {
  return (
    <dl className={`dl ${className}`.trim()}>
      {items
        .filter((i) => i.value !== null && i.value !== undefined && i.value !== "")
        .map((i) => (
          <div key={i.label} className="dl-row">
            {i.icon && <Icon name={i.icon} className="muted" />}
            <dt>{i.label}</dt>
            <dd>{i.value}</dd>
          </div>
        ))}
    </dl>
  );
}
