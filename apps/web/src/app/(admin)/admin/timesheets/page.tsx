import type { Metadata } from "next";
import { Timesheets } from "@/features/admin/Timesheets";

export const metadata: Metadata = { title: "Timesheets" };

export default function AdminTimesheetsPage() {
  return <Timesheets />;
}
