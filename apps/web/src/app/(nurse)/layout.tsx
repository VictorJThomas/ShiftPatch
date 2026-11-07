import type { ReactNode } from "react";
import { NurseShell } from "@/components/shells/NurseShell";
import { RoleGuard } from "@/features/auth/role-guard";

export default function NurseLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard role="nurse">
      <NurseShell>{children}</NurseShell>
    </RoleGuard>
  );
}
