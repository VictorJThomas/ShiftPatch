import type { Metadata } from "next";
import { AppBar } from "@/components/shells/NurseShell";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "My shifts" };

export default function NurseMyShiftsPage() {
  return (
    <>
      <AppBar title="My shifts" />
      <div className="body">
        <EmptyState icon="cal" title="No claimed shifts yet">
          Shifts you claim will show up here.
        </EmptyState>
      </div>
    </>
  );
}
