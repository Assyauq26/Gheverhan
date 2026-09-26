import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Percent, Users, Star, ShieldCheck, Truck } from "lucide-react";
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
  const [categories, featured, latest, recent, wishIds, flashSale] = await Promise.all([
    listCategories(),
    listProducts({ featured: true, pageSize: 4, includeTotal: false }),
    listProducts({ pageSize: 12, includeTotal: false }),
    user ? getRecentlyViewed(user.id) : Promise.resolve([]),
    user ? wishlistProductIds(user.id) : Promise.resolve([]),
    listProducts({ flashSale: true, pageSize: 1, includeTotal: false }),
  ]);

  const wl = new Set(wishIds);
  const featuredItems = featured.items.length > 0 ? featured.items : latest.items.slice(0, 4);
  const featuredIds = new Set(featuredItems.map((p) => p.id));
  const recommendedItems = latest.items.filter((p) => !featuredIds.has(p.id)).slice(0, 8);
  const flashImage = flashSale.items[0]?.images?.[0]?.url ?? HERO_IMG2;

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

      <section
        className="relative overflow-hidden rounded-[28px] border border-black/[0.04] bg-[#f7f7f7] px-4 py-5 shadow-[0_10px_30px_rgba(0,0,0,0.05)] sm:px-7 sm:py-6"
        data-testid="flash-sale"
      >
        <div className="relative z-10 flex min-h-[154px] items-center gap-3 sm:min-h-[132px] sm:gap-5 md:gap-8">
          <span
            aria-hidden="true"
            className="flex h-[58px] w-[58px] shrink-0 items-center justify-center bg-white text-ink [clip-path:polygon(50%_0%,61%_10%,76%_6%,84%_20%,97%_26%,92%_41%,100%_55%,87%_66%,84%_81%,68%_79%,50%_100%,37%_88%,21%_94%,17%_78%,2%_70%,8%_55%,0%_42%,13%_31%,16%_16%,34%_20%)] sm:h-[78px] sm:w-[78px]"
          >
            <Percent size={27} strokeWidth={2.4} className="sm:h-[30px] sm:w-[30px]" />
          </span>

          <div className="min-w-0 flex-1 self-center">
            <p className="text-xs font-medium text-ink-soft sm:text-base">Flash Sale</p>
            <h2 className="font-display text-[23px] font-black leading-[1.05] tracking-[-0.03em] text-ink sm:text-[32px]">
              Diskon 40%
            </h2>
            <p className="mt-1 text-xs text-ink-soft sm:text-base">Produk pilihan, stok terbatas!</p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-3 sm:gap-4 md:flex-row md:items-center md:gap-8">
            <Button asChild className="h-10 rounded-full px-4 text-xs sm:h-12 sm:px-7 sm:text-sm" data-testid="shop-sale-btn">
              <Link href="/shop?flash=1">
                Shop the Sale
                <ArrowRight size={15} />
              </Link>
            </Button>
            <FlashSaleTimer compact />
          </div>
        </div>

        <div className="pointer-events-none absolute -right-8 bottom-0 hidden h-full w-[27%] min-w-[190px] md:block">
          <Image
            src={flashImage}
            alt=""
            fill
            sizes="30vw"
            className="object-contain object-right-bottom opacity-95"
          />
        </div>
      </section>

      <section>
        <SectionHeader title="Produk Pilihan" subtitle="Koleksi terbaik untuk gaya harianmu" href="/shop" />
        <div className="stagger grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
          {featuredItems.map((p) => (
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
