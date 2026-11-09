import type { Metadata } from "next";
import { AdminUsers } from "@/features/admin/AdminUsers";

export const metadata: Metadata = { title: "Users" };

export default function AdminUsersPage() {
  return <AdminUsers />;
}
