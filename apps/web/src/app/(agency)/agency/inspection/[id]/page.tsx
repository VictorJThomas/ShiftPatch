"use client";

import { useParams } from "next/navigation";
import { PackageView } from "@/features/inspection/PackageView";

export default function AgencyInspectionPackagePage() {
  const { id } = useParams<{ id: string }>();
  return <PackageView id={id} basePath="/agency/inspection" />;
}
