import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/** Glyph tile + h2 title + short description + optional single action (design: Empty state). */
export function EmptyState({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-6 py-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-[20px] bg-muted text-[var(--c-ink-2)]">
        <Icon name={icon} size="lg" />
      </div>
      <h2 className="text-lg font-bold text-balance">{title}</h2>
      {children && <p className="max-w-[34ch] text-[var(--c-ink-2)]">{children}</p>}
      {action}
    </div>
  );
}
