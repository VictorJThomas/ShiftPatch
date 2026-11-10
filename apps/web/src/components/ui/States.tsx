import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
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
              <Skeleton className="h-[18px] w-[60%]" />
              <Skeleton className="h-5 w-[85%]" />
              <Skeleton className="h-7 w-[45%] rounded-full" />
              <Skeleton className="h-11" />
            </div>
          ))}
        </div>
      ) : (
        <div className="card" aria-hidden="true">
          {items.map((i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-3.5">
              <Skeleton className="h-4 flex-[2]" />
              <Skeleton className="h-4 flex-[3]" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-6 w-[84px] rounded-full" />
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
    <div className="flex flex-col items-center gap-2.5 px-6 py-10 text-center" role="alert">
      <div className="flex size-16 items-center justify-center rounded-[20px] bg-destructive-soft text-destructive">
        <Icon name="alert-circle" size="lg" />
      </div>
      <h2 className="text-lg font-bold text-balance">{title}</h2>
      <p className="max-w-[34ch] text-[var(--c-ink-2)]">{message}</p>
      <Button variant="secondary" onClick={onRetry}>
        <Icon name="refresh" />
        Retry
      </Button>
    </div>
  );
}
