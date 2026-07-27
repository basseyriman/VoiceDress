import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Outfit } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { PwaRegister } from "@/components/pwa-register";

/** Editorial fashion display — couture, not tech-default */
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

/** Calm geometric UI sans — premium without Inter/Roboto */
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://voicedress.com"
  ),
  title: "VoiceDress — Dress without deciding",
  description:
    "Voice-first wardrobe. Speak the day — we dress the full look on you.",
  applicationName: "VoiceDress",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "VoiceDress",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: "VoiceDress",
    description: "Dress without deciding.",
    images: ["/og.png"],
  },
  icons: {
    icon: [
      { url: "/icon.svg?v=14", type: "image/svg+xml" },
      { url: "/icons/icon-192.png?v=14", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png?v=14", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png?v=14", sizes: "180x180", type: "image/png" },
      { url: "/icons/icon-180.png?v=14", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#121110",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${outfit.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
        <PwaRegister />
      </body>
    </html>
  );
}
