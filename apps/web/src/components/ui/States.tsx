import { Icon } from "./Icon";

/** Loading placeholder shaped like the content: `card` = shift cards in `.card-grid`, `table` = table rows. */
export function ListSkeleton({ rows = 3, variant = "card" }: { rows?: number; variant?: "card" | "table" }) {
  const items = Array.from({ length: rows }, (_, i) => i);
  return (
    <div aria-busy="true">
      <span className="sr">Loading…</span>
      {variant === "card" ? (
        <div className="card-grid" aria-hidden="true">
          {items.map((i) => (
            <div key={i} className="card shift">
              <div className="skel" style={{ height: 18, width: "60%" }} />
              <div className="skel" style={{ height: 20, width: "85%" }} />
              <div className="skel" style={{ height: 28, width: "45%", borderRadius: "var(--r-pill)" }} />
              <div className="skel" style={{ height: 44 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="card" aria-hidden="true">
          {items.map((i) => (
            <div key={i} className="row" style={{ gap: 16, padding: "14px 16px", borderBottom: "1px solid var(--c-line)" }}>
              <div className="skel" style={{ height: 16, flex: 2 }} />
              <div className="skel" style={{ height: 16, flex: 3 }} />
              <div className="skel" style={{ height: 16, flex: 1 }} />
              <div className="skel" style={{ height: 24, width: 84, borderRadius: "var(--r-pill)" }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Failed load: message + Retry. `role="alert"` so the failure is announced. */
export function ErrorState({ title = "Something went wrong", message, onRetry }: { title?: string; message: string; onRetry: () => void }) {
  return (
    <div className="empty" role="alert">
      <div className="glyph" style={{ color: "var(--st-rejected-fg)", background: "var(--st-rejected-bg)" }}>
        <Icon name="alert-circle" size="lg" />
      </div>
      <h2>{title}</h2>
      <p>{message}</p>
      <button type="button" className="btn btn-secondary" onClick={onRetry}>
        <Icon name="refresh" />
        Retry
      </button>
    </div>
  );
}
