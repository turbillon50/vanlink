import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "@/components/brand/crystal.css";
import { Atmosphere } from "@/components/brand/atmosphere";
import { BrandEntrance } from "@/components/brand/entrance";
import { AuthProvider } from "@/components/auth/provider";
const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});
export const metadata: Metadata = {
  title: "VanDeFi · Tu dinero. Tu control.",
  description: "Tu wallet y tus links de pago en un mismo lugar. USDC en Base.",
  applicationName: "VanDeFi",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "VanDeFi",
  },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body
        className={geistSans.variable + " " + geistMono.variable + " font-sans"}
      >
        <AuthProvider>{children}</AuthProvider>
        <Atmosphere />
        <BrandEntrance />
      </body>
    </html>
  );
}
