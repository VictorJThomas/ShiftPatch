import type { Metadata } from "next";
import { AppBar, UserAvatar } from "@/components/shells/NurseShell";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Available shifts" };

export default function NurseShiftsPage() {
  return (
    <>
      <AppBar title="Available shifts">
        <UserAvatar />
      </AppBar>
      <div className="body">
        <EmptyState icon="inbox" title="No shifts to show yet">
          Open shifts you are eligible for will appear here.
        </EmptyState>
      </div>
    </>
  );
}
