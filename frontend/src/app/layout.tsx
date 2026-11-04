import type { Metadata } from "next";
import "./globals.css";
import { NavigationProvider } from "@/components/ui/navigation";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"),
  title: {
    default: "Toko Online",
    template: "%s | Toko Online",
  },
  description:
    "Jelajahi katalog produk dan kelola pesanan di toko online ini.",
  openGraph: {
    title: "Toko Online",
    description: "Toko online mandiri.",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Toko Online" },
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
