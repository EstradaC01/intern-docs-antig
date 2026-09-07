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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined') {
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    for (var i = 0; i < registrations.length; i++) {
                      registrations[i].unregister();
                    }
                  });
                }
                if ('caches' in window) {
                  caches.keys().then(function(keys) {
                    for (var i = 0; i < keys.length; i++) {
                      caches.delete(keys[i]);
                    }
                  });
                }
              }
            `,
          }}
        />
      </head>
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
