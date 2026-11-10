import type { Metadata } from "next";
import { CredentialUploadForm } from "@/features/nurse/CredentialUploadForm";
import { parseCredentialType } from "@/features/nurse/credential-upload";

export const metadata: Metadata = { title: "Add credential" };

/** `?type=license|tb_screening|other` presets the type (renewal links); anything else means license. */
export default async function NewCredentialPage({ searchParams }: { searchParams: Promise<{ type?: string | string[] }> }) {
  const { type } = await searchParams;
  return <CredentialUploadForm initialType={parseCredentialType(type)} />;
}
