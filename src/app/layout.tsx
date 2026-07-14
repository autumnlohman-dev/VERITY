import type { Metadata } from "next";
import { Lora, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import { BRAND_NAME } from "@/lib/brand";
import PostHogProvider from "@/components/PostHogProvider";
import "./globals.css";

// Locked typography (DESIGN-BIBLE Part 3): Lora display (400/500/600),
// Public Sans body, IBM Plex Mono 500 for every figure. Self-hosted via
// next/font so there is no layout-shift flash.
const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-lora",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-public-sans",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: "500",
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: `${BRAND_NAME}: Medical Bill Advocacy`,
  description:
    `${BRAND_NAME} audits every line item on your medical bill against published billing rules, finds the errors, and gives you dispute letters ready to send.`,
  // Private preview: keep the site out of search indexes while the password
  // gate is active. Remove alongside SITE_ACCESS_PASSWORD at launch.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${lora.variable} ${publicSans.variable} ${plexMono.variable}`}
    >
      <body className={`${lora.variable} ${publicSans.variable} ${plexMono.variable} min-h-full antialiased`}>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
