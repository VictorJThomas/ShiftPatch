import type { Metadata } from "next";
import { MyShifts } from "@/features/nurse/MyShifts";

export const metadata: Metadata = { title: "My shifts" };

export default function NurseMyShiftsPage() {
  return <MyShifts />;
}
