import type { Metadata, Viewport } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";

// Roboto is the font Google uses across its products (Calendar, Gmail, Docs, etc).
// Using it gives the app the same look-and-feel as Google Calendar.
const roboto = Roboto({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "700", "900"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Overseer — Life OS",
  description: "Your AI-powered personal operating system",
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    // Enables standalone mode when added to home screen on iOS (no Safari
    // chrome — looks/feels like a native app).
    capable: true,
    title: 'Overseer',
    statusBarStyle: 'black-translucent',
  },
  applicationName: 'Overseer',
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  // Matches the manifest's theme/background so iOS/Android paint the
  // address bar / status bar in the same color as the app.
  themeColor: '#09090b',
  // viewportFit='cover' makes the PWA respect iOS notches/dynamic island
  // properly (otherwise content gets clipped behind the safe areas).
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${roboto.variable} ${robotoMono.variable} dark`}
    >
      <body className="h-screen overflow-hidden bg-zinc-950" suppressHydrationWarning>
        <AppShell>{children}</AppShell>
        {/* Register the service worker AFTER hydration. Wrapped in a Script
            tag with strategy="afterInteractive" so it doesn't block initial
            paint. Only registers in production-like contexts (any origin
            served over HTTPS — service workers don't work over plain HTTP
            except on localhost). */}
        <Script id="sw-register" strategy="afterInteractive">
          {`
            if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
              window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js', { scope: '/' })
                  .catch((err) => console.warn('[sw] register failed:', err));
              });
            }
          `}
        </Script>
      </body>
    </html>
  );
}
