import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export function EmptyState({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="glyph">
        <Icon name={icon} size="lg" />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
