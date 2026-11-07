import type { ReactNode } from "react";
import { AdminShell } from "@/components/shells/AdminShell";
import { RoleGuard } from "@/features/auth/role-guard";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard role="admin">
      <AdminShell>{children}</AdminShell>
    </RoleGuard>
  );
}
