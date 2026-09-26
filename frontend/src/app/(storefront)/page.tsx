import Link from "next/link";
import { Percent, Users, Star, ShieldCheck, Truck, ArrowRight } from "lucide-react";
import { HeroCarousel } from "@/components/storefront/hero-carousel";
import { CategoryNav } from "@/components/storefront/category-nav";
import { FlashSaleTimer } from "@/components/storefront/flash-sale-timer";
import { SectionHeader } from "@/components/storefront/section-header";
import { ProductCard, toCardData } from "@/components/storefront/product-card";
import { Button } from "@/components/ui/button";
import { listProducts, listCategories } from "@/modules/catalog/catalog.service";
import { getRecentlyViewed } from "@/modules/catalog/recently-viewed.service";
import { getCurrentUserBasic } from "@/lib/auth/session";
import { wishlistProductIds } from "@/modules/wishlist/wishlist.service";

const HERO_IMG =
  "https://images.unsplash.com/photo-1603189343302-e603f7add05a?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400";
const HERO_IMG2 =
  "https://images.unsplash.com/photo-1613915617430-8ab0fd7c6baf?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400";

export default async function HomePage() {
  const user = await getCurrentUserBasic();
  const [categories, featured, latest, recent, wishIds] = await Promise.all([
    listCategories(),
    listProducts({ featured: true, pageSize: 4, includeTotal: false }),
    listProducts({ pageSize: 8, includeTotal: false }),
    user ? getRecentlyViewed(user.id) : Promise.resolve([]),
    user ? wishlistProductIds(user.id) : Promise.resolve([]),
  ]);
  const wl = new Set(wishIds);

  const slides = [
    {
      eyebrow: "New Season",
      title: "Better Outfits Brighter Days",
      subtitle: "Temukan koleksi terbaru untuk gaya harianmu yang lebih percaya diri.",
      image: HERO_IMG,
      href: "/shop",
    },
    {
      eyebrow: "Flash Sale",
      title: "Diskon Hingga 40%",
      subtitle: "Produk pilihan dengan harga terbaik, stok terbatas!",
      image: HERO_IMG2,
      href: "/shop?flash=1",
    },
  ];

  return (
    <div className="space-y-10">
      <HeroCarousel slides={slides} />

      <section>
        <SectionHeader title="Shop by Category" href="/shop" />
        <CategoryNav categories={categories} />
      </section>

      <section className="flex flex-col gap-4 rounded-3xl bg-surface p-5 md:flex-row md:items-center md:justify-between md:p-7" data-testid="flash-sale">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white">
            <Percent size={24} />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink-soft">Flash Sale</p>
            <h2 className="font-display text-2xl font-black text-ink">Diskon Hingga 40%</h2>
            <p className="text-sm text-ink-soft">Produk pilihan, stok terbatas!</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <FlashSaleTimer />
          <Button asChild data-testid="shop-sale-btn">
            <Link href="/shop?flash=1">Shop the Sale <ArrowRight size={16} /></Link>
          </Button>
        </div>
      </section>

      <section>
        <SectionHeader title="Produk Pilihan" subtitle="Koleksi terbaik untuk gaya harianmu" href="/shop" />
        <div className="stagger grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
          {featured.items.map((p) => (
            <ProductCard key={p.id} product={toCardData(p)} wishlisted={wl.has(p.id)} />
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section>
          <SectionHeader title="Baru Dilihat" subtitle="Lanjutkan dari produk terakhir kamu lihat" href="/shop" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
            {recent.map((r) => (
              <ProductCard key={r.id} product={toCardData(r.product)} wishlisted={wl.has(r.productId)} compact />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHeader title="Rekomendasi untukmu" href="/shop" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
          {latest.items.map((p) => (
            <ProductCard key={p.id} product={toCardData(p)} wishlisted={wl.has(p.id)} />
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 rounded-3xl bg-surface p-5 md:grid-cols-4">
        {[
          { icon: Users, t: "100K+", s: "Pelanggan Puas" },
          { icon: Star, t: "4.8/5", s: "dari 20K+ ulasan" },
          { icon: ShieldCheck, t: "Trusted Seller", s: "Produk Original 100%" },
          { icon: Truck, t: "Pengiriman Cepat", s: "ke Seluruh Indonesia" },
        ].map((x, i) => (
          <div key={i} className="flex flex-col items-center gap-1 text-center">
            <x.icon size={22} className="text-ink" />
            <p className="font-display font-bold text-ink">{x.t}</p>
            <p className="text-xs text-ink-muted">{x.s}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
