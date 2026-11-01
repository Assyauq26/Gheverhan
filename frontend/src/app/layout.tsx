import type { Metadata } from "next";
import "./globals.css";
import { NavigationProvider } from "@/components/ui/navigation";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"),
  title: {
    default: "JetSeller Demo Store",
    template: "%s | JetSeller",
  },
  description:
    "JetSeller Demo Store adalah toko fashion online untuk pakaian dan aksesoris pria & wanita. Temukan koleksi terbaru dengan gaya minimalis modern.",
  openGraph: {
    title: "JetSeller Demo Store",
    description: "Toko demo JetSeller.",
    type: "website",
    images: [{ url: "/brand/jetseller-og.png", width: 1200, height: 630, alt: "JetSeller Demo Store" }],
  },
  twitter: { card: "summary_large_image", title: "JetSeller Demo Store", images: ["/brand/jetseller-og.png"] },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body><NavigationProvider>{children}</NavigationProvider></body>
    </html>
  );
}
