import type { Metadata } from "next";
import { Credentials } from "@/features/nurse/Credentials";

export const metadata: Metadata = { title: "Credentials" };

export default function NurseCredentialsPage() {
  return <Credentials />;
}
