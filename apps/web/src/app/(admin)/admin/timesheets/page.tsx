import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Timesheets" };

export default function AdminTimesheetsPage() {
  return (
    <>
      <h1 className="page-h">Timesheets</h1>
      <EmptyState icon="clock" title="No timesheets yet">
        Timesheets for completed shifts will appear here.
      </EmptyState>
    </>
  );
}
