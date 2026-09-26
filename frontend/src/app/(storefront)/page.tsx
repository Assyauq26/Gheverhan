import Link from "next/link";
import { ArrowRight, Users, Star, ShieldCheck, Truck } from "lucide-react";
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
    listProducts({ pageSize: 12, includeTotal: false }),
    user ? getRecentlyViewed(user.id) : Promise.resolve([]),
    user ? wishlistProductIds(user.id) : Promise.resolve([]),
  ]);

  const wl = new Set(wishIds);
  // Some seed/catalog data may not have isFeatured flags yet. Keep the section
  // useful by falling back to the newest published products instead of rendering
  // an empty section when the catalog itself is populated.
  const featuredItems = featured.items.length > 0 ? featured.items : latest.items.slice(0, 4);
  const featuredIds = new Set(featuredItems.map((p) => p.id));
  const recommendedItems = latest.items.filter((p) => !featuredIds.has(p.id)).slice(0, 8);

  const slides = [
    {
      image: HERO_IMG,
      alt: "Gheverhan New Season collection",
    },
    {
      image: HERO_IMG2,
      alt: "Gheverhan fashion collection",
    },
  ];

  return (
    <div className="space-y-6">
      <HeroCarousel slides={slides} />

      <section>
        <SectionHeader title="Kategori" href="/shop" />
        <CategoryNav categories={categories} />
      </section>

      <section
        className="relative overflow-hidden rounded-xl border border-black/[0.05] bg-[#f7f7f7] px-4 py-2.5 shadow-[0_5px_16px_rgba(0,0,0,0.03)] sm:px-6 sm:py-2.5"
        data-testid="flash-sale"
      >
        <div className="relative z-10 flex min-h-[86px] items-center gap-3 sm:min-h-[90px] sm:gap-5 md:gap-7">
          <div className="min-w-0 flex-1 self-center">
            <p className="text-[15px] font-bold leading-tight text-ink sm:text-base">Flash Sale!</p>
            <h2 className="mt-0.5 font-display text-[25px] font-black leading-[1.02] tracking-[-0.035em] text-ink sm:text-[29px]">
              Diskon hingga 40%
            </h2>
            <p className="mt-1 text-[11px] leading-tight text-ink-soft sm:text-sm">Produk pilihan, stok terbatas!</p>
          </div>

          <div className="flex w-[124px] shrink-0 flex-col items-end gap-1.5 sm:w-[132px] sm:gap-2">
            <Button
              asChild
              className="h-10 w-full rounded-[7px] px-2 text-[11px] font-medium sm:h-10 sm:text-xs"
              data-testid="shop-sale-btn"
            >
              <Link href="/shop?flash=1">
                Beli Sekarang
                <ArrowRight size={15} />
              </Link>
            </Button>
            <FlashSaleTimer compact />
          </div>
        </div>
      </section>

      <section>
        <SectionHeader title="Produk Pilihan" subtitle="Koleksi terbaik untuk gaya harianmu" href="/shop" />
        <div className="stagger grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4">
          {featuredItems.map((p) => (
            <ProductCard key={p.id} product={toCardData(p)} wishlisted={wl.has(p.id)} featured />
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section>
          <SectionHeader title="Baru Dilihat" subtitle="Lanjutkan dari produk terakhir kamu lihat" href="/shop" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4">
            {recent.map((r) => (
              <ProductCard key={r.id} product={toCardData(r.product)} wishlisted={wl.has(r.productId)} compact />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHeader title="Rekomendasi untukmu" href="/shop" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4">
          {recommendedItems.map((p) => (
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
