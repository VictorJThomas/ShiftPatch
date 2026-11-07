import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/** Glyph tile + h2 title + short description + optional single action (design: Empty state). */
export function EmptyState({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="glyph">
        <Icon name={icon} size="lg" />
      </div>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
