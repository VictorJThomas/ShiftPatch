import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Audit log" };

export default function AdminAuditPage() {
  return (
    <>
      <h1 className="page-h">Audit log</h1>
      <EmptyState icon="file" title="No audit entries to show">
        Every action on a shift will be recorded here.
      </EmptyState>
    </>
  );
}
