// app/layout.tsx
import type { Metadata } from "next";
import type { Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

import MetaPixel from "./MetaPixel";
import InstallPrompt from "@/components/InstallPrompt";
import Shell from "@/components/Shell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0B0B0E",
};

export const metadata: Metadata = {
  applicationName: "LineScout",
  title: "LineScout - China Sourcing Intelligence by Sure Imports",
  description:
    "LineScout helps entrepreneurs source products in China, compare suppliers, estimate landed costs, and plan reliable production and white-label launches with Sure Imports’ expertise.",
  manifest: "/manifest.webmanifest",

  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LineScout",
  },

  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },

  openGraph: {
    type: "website",
    siteName: "LineScout",
    title: "LineScout - China Sourcing Intelligence by Sure Imports",
    description:
      "China sourcing guidance for products and white-label launches. Compare suppliers, estimate landed costs, and plan execution with confidence.",
    url: "https://linescout.sureimports.com",
    images: [
      {
        url: "/linescout-social.png",
        width: 1200,
        height: 630,
        alt: "LineScout - China Sourcing Intelligence",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "LineScout - China Sourcing Intelligence by Sure Imports",
    description:
      "China sourcing guidance for products and white-label launches. Compare suppliers, estimate landed costs, and plan execution with confidence.",
    images: ["/linescout-social.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        {/* Meta Pixel Base */}
        <Script
          id="facebook-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '1221261339913567');
              fbq('track', 'PageView');
            `,
          }}
        />

        <noscript
          dangerouslySetInnerHTML={{
            __html: `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=1221261339913567&ev=PageView&noscript=1" />`,
          }}
        />

        {/* Tracks PageView on route changes */}
        <MetaPixel />

        <InstallPrompt minSeconds={90} minVisits={2} cooldownDays={7} maxShows={3} />

        {/* Global shell: hides Navbar for /internal routes via Shell */}
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
