import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./fullscreen.css";
import "../styles/player-effects.css";
import { Providers } from "./providers";
import Navbar from "@/components/layout/Navbar";
import { FullscreenLayoutProvider } from "@/components/providers/FullscreenLayoutProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f4" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export const metadata: Metadata = {
  title: "Jeux à Boire",
  description: "Collection de jeux festifs entre amis",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Jeux à Boire"
  },
  manifest: "/manifest.json",
  applicationName: "Jeux à Boire",
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head />
      <body className={`${inter.className} antialiased`}>
        <ErrorBoundary>
          <Providers>
            <FullscreenLayoutProvider>
              <div className="relative min-h-screen fullscreen-container">
                <Navbar />
                <div className="content-container mt-5">
                  {children}
                </div>
              </div>
            </FullscreenLayoutProvider>
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}
