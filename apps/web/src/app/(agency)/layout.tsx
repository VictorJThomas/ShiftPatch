import type { ReactNode } from "react";
import { AgencyShell } from "@/components/shells/AgencyShell";
import { RoleGuard } from "@/features/auth/role-guard";

export default function AgencyLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard role="agency">
      <AgencyShell>{children}</AgencyShell>
    </RoleGuard>
  );
}
