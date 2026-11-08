import type { Metadata } from "next";
import { AuditLog } from "@/features/admin/AuditLog";

export const metadata: Metadata = { title: "Audit log" };

export default function AdminAuditPage() {
  return <AuditLog />;
}
