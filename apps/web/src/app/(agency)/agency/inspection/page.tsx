import type { Metadata } from "next";
import { InspectionPage } from "@/features/inspection/InspectionPage";

export const metadata: Metadata = { title: "Inspection packages" };

export default function AgencyInspectionPage() {
  return <InspectionPage basePath="/agency/inspection" />;
}
