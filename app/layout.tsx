import type { Metadata, Viewport } from "next";
import Providers from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "IBA Written — AI-Powered Exam Preparation",
    template: "%s | IBA Written",
  },
  description:
    "Practice IBA written exam questions with AI-powered grading. Get instant feedback, track progress, and join weekly exams with leaderboards.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "IBA Written",
  },
};

export const viewport: Viewport = {
  themeColor: "#22c55e",
  width: "device-width",
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
    <html lang="en">
      <body className="min-h-dvh flex flex-col bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
