import { getPublishedAppearance } from "@/modules/appearance/published";
import { themeStyle, isLegacy } from "@/modules/appearance/runtime";
import { AppearanceProvider, PublishedVersionSync, StoreLogo } from "@/components/appearance/context";
import { StorefrontHeader } from "@/components/storefront/header";
import { BottomNav } from "@/components/storefront/bottom-nav";
import { Truck, ShieldCheck, Headphones, Star } from "lucide-react";
import Link from "@/components/ui/navigation";
import { getStorefrontUserContext } from "@/lib/auth/session";
import { RegistrationOtpCleanup } from "@/components/auth/registration-otp-cleanup";

export async function generateMetadata() {
  const {config} = await getPublishedAppearance();
  return { title: { default: `${config.identity.name} — ${config.identity.tagline}`, template: `%s | ${config.identity.name}` }, description: config.identity.tagline, openGraph: { title: config.identity.name, description: config.identity.tagline } };
}

export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The shared layout needs identity + cart badge only. Resolve both from
  // one request-scoped database lookup instead of user query + cart query.
  const [user, appearance] = await Promise.all([getStorefrontUserContext(), getPublishedAppearance()]);
  const theme = appearance.config;
  const count = user?.cartCount ?? 0;

  return (
    <AppearanceProvider config={theme}>
    <div style={themeStyle(theme)} data-theme-active={!isLegacy(theme)} className="storefront-root min-h-screen bg-white pb-24 md:pb-0">
      <PublishedVersionSync version={appearance.version} />
      {user && <RegistrationOtpCleanup />}
      <StorefrontHeader user={user} cartCount={count} />
      <main className="container py-2 md:py-6">{children}</main>

      <footer className="mt-10 border-t border-line bg-white">
        <div className="container grid grid-cols-2 gap-6 py-8 md:grid-cols-4">
          {(theme.footer.trustFeatures ? [
            { icon: Truck, t: "Pengiriman Cepat", s: "ke seluruh Indonesia" },
            { icon: ShieldCheck, t: "Belanja Aman", s: "100% transaksi aman" },
            { icon: Headphones, t: "CS Responsif", s: "Siap membantu kamu" },
            { icon: Star, t: "100K+ Pelanggan", s: "Sudah percaya Gheverhan" },
          ] : []).map((f, i) => (
            <div key={i} className="flex items-center gap-3">
              <f.icon size={24} className="text-ink" />
              <div>
                <p className="text-sm font-semibold text-ink">{f.t}</p>
                <p className="text-xs text-ink-muted">{f.s}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-line">
          <div className="container flex flex-col items-center justify-between gap-2 py-6 text-xs text-ink-muted md:flex-row">
            <span className="font-display text-lg font-extrabold text-ink">{theme.footer.showLogo && <StoreLogo />}</span>
            {isLegacy(theme) ? <span>© {new Date().getFullYear()} Gheverhan. Better Outfits, Brighter Days.</span> : <span>© {new Date().getFullYear()} {theme.identity.name}. {theme.footer.tagline}</span>}
            <nav aria-label="Informasi website" className="flex flex-wrap justify-center gap-4"><Link href="/syarat-ketentuan" className="hover:text-ink">Syarat &amp; Ketentuan</Link><Link href="/kebijakan-privasi" className="hover:text-ink">Kebijakan Privasi</Link><Link href="/admin" className="hover:text-ink">Admin</Link></nav>
          </div>
        </div>
      </footer>

      <BottomNav cartCount={count} />
    </div>
    </AppearanceProvider>
  );
}
