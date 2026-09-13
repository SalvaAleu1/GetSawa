import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Space_Grotesk } from "next/font/google";
import { Suspense } from "react";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: true,
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
  preload: true,
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
  preload: false,
});

const appUrl = process.env.APP_URL || "https://getsawa.app";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "GetSawa — Domains, Hosting & Websites",
    template: "%s | GetSawa",
  },
  description:
    "Search, register, and manage domains, hosting, business email, website security, and websites from one GetSawa account.",
  applicationName: "GetSawa",
  keywords: [
    "domain registration",
    "web hosting",
    "business email",
    "website builder",
    "DNS",
    "SSL",
    "GetSawa",
  ],
  creator: "GetSawa",
  publisher: "GetSawa",
  category: "technology",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "GetSawa",
    url: "/",
    title: "GetSawa — Domains, Hosting & Websites",
    description:
      "Domains, hosting, business email, website security, and website tools managed from one account.",
  },
  twitter: {
    card: "summary",
    title: "GetSawa — Domains, Hosting & Websites",
    description:
      "Domains, hosting, business email, website security, and website tools managed from one account.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#101F57",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${ibmPlexMono.variable}`}
    >
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <PwaRegister />
        <div id="main-content" tabIndex={-1}>
          <Suspense fallback={null}>{children}</Suspense>
        </div>
      </body>
    </html>
  );
}
