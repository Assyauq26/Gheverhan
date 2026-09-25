import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"),
  title: {
    default: "Gheverhan — Better Outfits, Brighter Days",
    template: "%s | Gheverhan",
  },
  description:
    "Gheverhan adalah toko fashion online untuk pakaian dan aksesoris pria & wanita. Temukan koleksi terbaru dengan gaya minimalis modern.",
  openGraph: {
    title: "Gheverhan",
    description: "Better Outfits, Brighter Days.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
