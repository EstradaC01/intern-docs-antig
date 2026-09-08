import type { Metadata } from "next";
import "./globals.css";
import { RefreshOnFocus } from "@/components/RefreshOnFocus";

export const metadata: Metadata = {
  title: "InternDocs — Makerspace",
  description: "Track, submit, and approve Makerspace intern requirements in one place.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      {/* suppressHydrationWarning here only silences mismatches on <body> itself (non-recursive) --
          this is the standard guard against browser extensions (ad blockers, password managers,
          antivirus) that inject attributes like bis_skin_checked before React hydrates. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <RefreshOnFocus />
        {children}
      </body>
    </html>
  );
}
