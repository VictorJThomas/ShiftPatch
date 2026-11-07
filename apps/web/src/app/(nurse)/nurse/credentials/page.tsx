import type { Metadata } from "next";
import { AppBar } from "@/components/shells/NurseShell";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Credentials" };

export default function NurseCredentialsPage() {
  return (
    <>
      <AppBar title="Credentials" />
      <div className="body">
        <EmptyState icon="idcard" title="No credentials listed">
          Your licenses and certifications will be listed here.
        </EmptyState>
      </div>
    </>
  );
}
