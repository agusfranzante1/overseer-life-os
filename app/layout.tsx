import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";

// Inter — la tipografía humanista sans-serif que matchea el mockup
// glassmorphic. Letterforms suaves con buena legibilidad en dark UI.
// Reemplaza a Roboto (que era para matchear el look de Google Calendar).
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const jbMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  // Default title — shown on the initial paint and on routes that
  // <TitleUpdater> doesn't recognize (login, etc). Once React mounts,
  // <TitleUpdater> kicks in and updates document.title to
  // "OVERSEER · {section}" matching the sidebar's nav labels.
  title: "OVERSEER · Life OS",
  description: "Your AI-powered personal operating system",
  // Icons come from the file-based convention in /app: `icon.png` for the
  // favicon and `apple-icon.png` for iOS touch icons. Both are copies of
  // /public/logo.png. We removed the legacy `app/favicon.ico` because it
  // was taking priority and showing the OLD icon.
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
  themeColor: '#0a0e15',
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
      className={`${inter.variable} ${jbMono.variable} dark`}
    >
      {/* Navy-black del mockup — casi negro con tinte azul muy sutil.
          La base es #0a0e15 → #0b0f17. Más oscuro que zinc-950 puro
          porque tiene un toque cyan en la mezcla. */}
      <body
        className="h-screen overflow-hidden"
        style={{ background: '#0a0e15' }}
        suppressHydrationWarning
      >
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
