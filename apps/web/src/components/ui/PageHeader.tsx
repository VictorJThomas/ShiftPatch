import type { ReactNode } from "react";

/** Page title (the page's single h1) + optional subline + actions that wrap below the title on narrow screens. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div style={{ minWidth: 0 }}>
        <h1 className="page-h">{title}</h1>
        {description && <p className="page-sub">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
