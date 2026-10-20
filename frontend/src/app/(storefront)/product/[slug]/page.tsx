import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, Package, Truck } from "lucide-react";
import "@/components/storefront/product-detail.css";
import type { Metadata } from "next";
import Link from "@/components/ui/navigation";
import {
  getProductBySlug,
  getRelatedProducts,
} from "@/modules/catalog/catalog.service";
import { trackView } from "@/modules/catalog/recently-viewed.service";
import { getStorefrontUserContext } from "@/lib/auth/session";
import { wishlistProductIds } from "@/modules/wishlist/wishlist.service";
import { effectivePrice } from "@/lib/money";
import {
  ProductSelectionProvider,
  ProductSelectionPrice,
} from "@/components/storefront/product-selection";
import { effectiveProductPrice } from "@/modules/promotions/scheduled-flash-sale";
import { Rating } from "@/components/ui/rating";
import { Badge } from "@/components/ui/badge";
import { ProductGallery } from "@/components/storefront/product-gallery";
import { PurchasePanel } from "@/components/storefront/purchase-panel";
import { ShareButton } from "@/components/storefront/share-button";
import { WishlistButton } from "@/components/storefront/wishlist-button";
import { ReviewForm } from "@/components/storefront/review-form";
import { QnaForm } from "@/components/storefront/qna-form";
import { SectionHeader } from "@/components/storefront/section-header";
import { ProductCard, toCardData } from "@/components/storefront/product-card";

export const dynamic = "force-dynamic";

type ProductRouteProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: ProductRouteProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Produk tidak ditemukan" };
  return {
    title: product.name,
    description: product.description.slice(0, 160),
    alternates: { canonical: `/product/${product.slug}` },
    openGraph: {
      title: product.name,
      description: product.description.slice(0, 160),
      images: product.images[0]?.url ? [product.images[0].url] : [],
    },
  };
}

export default async function ProductPage({ params }: ProductRouteProps) {
  const { slug } = await params;
  const [product, user] = await Promise.all([
    getProductBySlug(slug),
    getStorefrontUserContext(),
  ]);
  if (!product) notFound();
  const [related, wishIds] = await Promise.all([
    getRelatedProducts({ id: product.id, categoryId: product.categoryId }),
    user ? wishlistProductIds(user.id) : Promise.resolve([]),
  ]);

  // Analytics must never block the product response. The previous awaited
  // write added a database round-trip to every product navigation.
  if (user) void trackView(user.id, product.id).catch(() => {});

  const wl = new Set(wishIds);
  const price = effectiveProductPrice(product);
  const variantOptions = product.variants.map((v) => ({
    id: v.id,
    sku: v.sku,
    optionValueIds: v.optionValues.map((s) => s.valueId),
    price: v.price != null ? effectivePrice(v.price, v.salePrice) : price,
    originalPrice: v.price ?? product.basePrice,
    color: v.color,
    size: v.size,
    available: v.inventory ? v.inventory.onHand - v.inventory.reserved : 0,
  }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: product.images.map((i) => i.url),
    description: product.description,
    brand: { "@type": "Brand", name: product.brand?.name ?? "Gheverhan" },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: product.ratingAvg,
      reviewCount: product.reviewCount,
    },
    offers: {
      "@type": "Offer",
      price,
      priceCurrency: "IDR",
      availability: variantOptions.some((v) => v.available > 0)
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
  };

  return (
    <div className="pdp-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <ProductSelectionProvider key={product.id}>
        <div className="pdp-main" data-testid="pdp-main">
          <div className="pdp-hero">
            <div className="pdp-media">
              <ProductGallery images={product.images} name={product.name}/>
              <div className="pdp-topbar" aria-label="Navigasi produk">
                <Link href="/shop" aria-label="Kembali ke toko"
                  className="pdp-header-action grid h-11 w-11 place-items-center bg-white/90 shadow-sm backdrop-blur">
                  <ArrowLeft size={23}/>
                </Link>
                <span className="pdp-topbar-center">Gheverhan</span>
                <div className="pdp-topbar-actions">
                  <WishlistButton productId={product.id} initialActive={wl.has(product.id)}
                    className="pdp-header-action h-11 w-11 rounded-2xl bg-white/90"/>
                  <ShareButton title={product.name} iconOnly/>
                </div>
              </div>
            </div>
          </div>
          <div className="pdp-sheet">
            <span className="pdp-handle" aria-hidden="true"/>
            <div className="mb-1.5 text-sm font-medium text-zinc-400">
              {product.brand?.name ?? "Gheverhan"}
            </div>
            <h1 className="pdp-heading text-[1.75rem] font-extrabold leading-tight text-zinc-950 sm:text-[2rem]">
              {product.name}
            </h1>
            <a href="#reviews" className="mt-2.5 inline-flex items-center gap-2 text-sm text-zinc-500">
              <Rating value={product.ratingAvg} size={16}/>
              <span>({product.reviewCount} ulasan)</span>
            </a>
            <div className="my-5">
              <ProductSelectionPrice defaultPrice={price} basePrice={product.basePrice}/>
            </div>
            <PurchasePanel
              productId={product.id}
              variants={variantOptions}
              groups={product.optionsEnabled ? product.optionGroups : undefined}
              wishlisted={wl.has(product.id)}
            />
            <div className="mt-6 border-t border-zinc-100">
              <details className="pdp-detail-row group py-4" open>
                <summary className="flex min-h-7 cursor-pointer items-center justify-between gap-3 text-sm font-bold text-zinc-900">
                  Deskripsi <ChevronRight className="pdp-detail-chevron shrink-0 text-zinc-500 transition-transform" size={19}/>
                </summary>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-zinc-500">
                  {product.description || "Informasi produk akan segera tersedia."}
                </p>
              </details>
              <details className="pdp-detail-row group py-4">
                <summary className="flex min-h-7 cursor-pointer items-center gap-3 text-sm font-medium text-zinc-800">
                  <Package size={19} className="shrink-0"/>
                  <span className="flex-1">Material &amp; Perawatan</span>
                  <ChevronRight className="pdp-detail-chevron shrink-0 text-zinc-500 transition-transform" size={19}/>
                </summary>
                <p className="mt-3 whitespace-pre-line pl-8 text-sm leading-relaxed text-zinc-500">
                  {[product.material, product.careInstruction].filter(Boolean).join("\n") || "Informasi material dan perawatan belum tersedia."}
                </p>
              </details>
              <details className="pdp-detail-row group py-4">
                <summary className="flex min-h-7 cursor-pointer items-center gap-3 text-sm font-medium text-zinc-800">
                  <Truck size={19} className="shrink-0"/>
                  <span className="flex-1">Pengiriman &amp; Retur</span>
                  <ChevronRight className="pdp-detail-chevron shrink-0 text-zinc-500 transition-transform" size={19}/>
                </summary>
                <p className="mt-3 whitespace-pre-line pl-8 text-sm leading-relaxed text-zinc-500">
                  {product.shippingReturn || "Informasi pengiriman dan retur belum tersedia."}
                </p>
              </details>
            </div>
          </div>
        </div>
      </ProductSelectionProvider>

      <div className="pdp-below space-y-12">
      <section id="reviews">
        <SectionHeader title={`Ulasan (${product.reviewCount})`} />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            {product.reviews.length === 0 && (
              <p className="text-sm text-ink-soft">
                Belum ada ulasan. Jadilah yang pertama!
              </p>
            )}
            {product.reviews.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border border-line p-4"
                data-testid={`review-${r.id}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">
                    {r.user.name}
                  </span>
                  <Rating value={r.rating} />
                </div>
                {r.title && (
                  <p className="mt-2 text-sm font-semibold text-ink">
                    {r.title}
                  </p>
                )}
                <p className="mt-1 text-sm text-ink-soft">{r.body}</p>
              </div>
            ))}
          </div>
          <div>
            <h3 className="mb-3 font-display text-lg font-bold text-ink">
              Tulis Ulasan
            </h3>
            <ReviewForm productId={product.id} slug={product.slug} />
          </div>
        </div>
      </section>

      <section>
        <SectionHeader title="Tanya Jawab Produk" />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            {product.questions.length === 0 && (
              <p className="text-sm text-ink-soft">Belum ada pertanyaan.</p>
            )}
            {product.questions.map((q) => (
              <div
                key={q.id}
                className="rounded-2xl border border-line p-4"
                data-testid={`question-${q.id}`}
              >
                <p className="text-sm font-semibold text-ink">T: {q.body}</p>
                {q.answers.map((a) => (
                  <p key={a.id} className="mt-2 text-sm text-ink-soft">
                    J: {a.body}{" "}
                    {a.isOfficial && (
                      <Badge variant="info" className="ml-1">
                        Penjual
                      </Badge>
                    )}
                  </p>
                ))}
              </div>
            ))}
          </div>
          <div>
            <h3 className="mb-3 font-display text-lg font-bold text-ink">
              Ajukan Pertanyaan
            </h3>
            <QnaForm productId={product.id} slug={product.slug} />
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section>
          <SectionHeader title="Kamu Mungkin Suka" href="/shop" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
            {related.slice(0, 4).map((p) => (
              <ProductCard
                key={p.id}
                product={toCardData(p)}
                wishlisted={wl.has(p.id)}
              />
            ))}
          </div>
        </section>
      )}
      </div>
    </div>
  );
}
