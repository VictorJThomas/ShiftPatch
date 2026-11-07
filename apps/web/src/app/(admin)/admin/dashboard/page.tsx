import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Coverage" };

export default function AdminDashboardPage() {
  return (
    <>
      <div>
        <h1 className="page-h" style={{ fontSize: 32, letterSpacing: "-.03em" }}>
          Coverage
        </h1>
        <p className="muted" style={{ fontSize: 14 }}>
          All agencies · facility-local time
        </p>
      </div>
      <EmptyState icon="grid" title="Coverage is coming">
        Open, filled and cancelled shifts across all agencies will show here.
      </EmptyState>
    </>
  );
}
