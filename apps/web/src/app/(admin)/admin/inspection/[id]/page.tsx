"use client";

import { useParams } from "next/navigation";
import { PackageView } from "@/features/inspection/PackageView";

export default function AdminInspectionPackagePage() {
  const { id } = useParams<{ id: string }>();
  return <PackageView id={id} basePath="/admin/inspection" />;
}
