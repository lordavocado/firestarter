import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lejechat – Chatbots til danske udlejningsboliger",
  description: "Byg en dansk chatbot, der svarer på spørgsmål om ledige lejemål, depositum og indflytning på få minutter.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_URL || "https://lejechat.dk"),
  openGraph: {
    title: "Lejechat – Chatbots til danske udlejningsboliger",
    description: "Byg en dansk chatbot, der svarer på spørgsmål om ledige lejemål, depositum og indflytning på få minutter.",
    url: "/",
    siteName: "Lejechat",
    images: [
      {
        url: "/lejechat-logo.svg",
        width: 1200,
        height: 630,
        alt: "Lejechat – chatbots til udlejning",
      },
    ],
    locale: "da_DK",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lejechat – Chatbots til udlejning",
    description: "Svar på spørgsmål om dine lejemål direkte i chatten.",
    images: ["/lejechat-logo.svg"],
    creator: "@lejechat",
  },
  icons: {
    icon: "/lejechat-favicon.svg",
    shortcut: "/lejechat-favicon.svg",
    apple: "/lejechat-favicon.svg",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="da" suppressHydrationWarning>
      <body
        suppressHydrationWarning={true}
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          inter.variable
        )}
      >
        <main className="">
          {children}
        </main>
        <Analytics />
      </body>
    </html>
  );
}
