import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import "./globals.css";

const schibsted = Schibsted_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-schibsted", display: "swap" });

export const metadata: Metadata = {
  title: { default: "ShiftPatch", template: "%s · ShiftPatch" },
  description: "Shift marketplace for nursing staffing: agencies post, nurses claim, hospitals see it all.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, interactiveWidget: "resizes-content" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={schibsted.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
