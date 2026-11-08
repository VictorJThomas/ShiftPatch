import type { Metadata } from "next";
import { Profile } from "@/features/nurse/Profile";

export const metadata: Metadata = { title: "Profile" };

export default function NurseProfilePage() {
  return <Profile />;
}
