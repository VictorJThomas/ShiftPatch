import type { Metadata } from "next";
import { Marketplace } from "@/features/nurse/Marketplace";

export const metadata: Metadata = { title: "Available shifts" };

export default function NurseShiftsPage() {
  return <Marketplace />;
}
