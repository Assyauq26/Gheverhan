import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getProductBySlug, getRelatedProducts } from "@/modules/catalog/catalog.service";
import { trackView } from "@/modules/catalog/recently-viewed.service";
import { getCurrentUser } from "@/lib/auth/session";
import { wishlistProductIds } from "@/modules/wishlist/wishlist.service";
import { formatIDR, effectivePrice, discountPercent } from "@/lib/money";
import { Rating } from "@/components/ui/rating";
import { Badge } from "@/components/ui/badge";
import { ProductGallery } from "@/components/storefront/product-gallery";
import { PurchasePanel } from "@/components/storefront/purchase-panel";
import { ShareButton } from "@/components/storefront/share-button";
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
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const user = await getCurrentUser();
  const [related, wishIds] = await Promise.all([
    getRelatedProducts({ id: product.id, categoryId: product.categoryId }),
    user ? wishlistProductIds(user.id) : Promise.resolve([]),
  ]);
  if (user) await trackView(user.id, product.id).catch(() => {});
  const wl = new Set(wishIds);

  const price = effectivePrice(product.basePrice, product.salePrice);
  const pct = discountPercent(product.basePrice, product.salePrice);
  const variantOptions = product.variants.map((v) => ({
    id: v.id,
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
    <div className="space-y-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <div className="grid gap-8 md:grid-cols-2">
        <ProductGallery images={product.images} name={product.name} />

        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              {product.brand && (
                <Link href={`/brand/${product.brand.slug}`} className="text-sm font-semibold text-ink-soft hover:text-ink">
                  {product.brand.name}
                </Link>
              )}
              <h1 className="font-display text-3xl font-black leading-tight text-ink">{product.name}</h1>
            </div>
            <ShareButton title={product.name} />
          </div>

          <Rating value={product.ratingAvg} count={product.reviewCount} size={16} />

          <div className="flex flex-wrap items-center gap-3">
            <span className="font-display text-3xl font-black text-ink">{formatIDR(price)}</span>
            {pct > 0 && (
              <>
                <span className="text-lg text-ink-muted line-through">{formatIDR(product.basePrice)}</span>
                <Badge variant="sale">{pct}% OFF</Badge>
              </>
            )}
          </div>

          <PurchasePanel productId={product.id} variants={variantOptions} wishlisted={wl.has(product.id)} />

          <div className="space-y-2 pt-2">
            {[
              { t: "Deskripsi", c: product.description },
              { t: "Material & Perawatan", c: product.material + "\n" + product.careInstruction },
              { t: "Pengiriman & Retur", c: product.shippingReturn },
            ].map((sec, i) => (
              <details key={i} className="group rounded-2xl border border-line p-4" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-ink">
                  {sec.t}
                  <span className="text-ink-muted transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 whitespace-pre-line text-sm text-ink-soft">{sec.c}</p>
              </details>
            ))}
          </div>
        </div>
      </div>

      {/* Reviews */}
      <section id="reviews">
        <SectionHeader title={`Ulasan (${product.reviewCount})`} />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            {product.reviews.length === 0 && (
              <p className="text-sm text-ink-soft">Belum ada ulasan. Jadilah yang pertama!</p>
            )}
            {product.reviews.map((r) => (
              <div key={r.id} className="rounded-2xl border border-line p-4" data-testid={`review-${r.id}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">{r.user.name}</span>
                  <Rating value={r.rating} />
                </div>
                {r.title && <p className="mt-2 text-sm font-semibold text-ink">{r.title}</p>}
                <p className="mt-1 text-sm text-ink-soft">{r.body}</p>
              </div>
            ))}
          </div>
          <div>
            <h3 className="mb-3 font-display text-lg font-bold text-ink">Tulis Ulasan</h3>
            <ReviewForm productId={product.id} slug={product.slug} />
          </div>
        </div>
      </section>

      {/* Q&A */}
      <section>
        <SectionHeader title="Tanya Jawab Produk" />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            {product.questions.length === 0 && (
              <p className="text-sm text-ink-soft">Belum ada pertanyaan.</p>
            )}
            {product.questions.map((q) => (
              <div key={q.id} className="rounded-2xl border border-line p-4" data-testid={`question-${q.id}`}>
                <p className="text-sm font-semibold text-ink">T: {q.body}</p>
                {q.answers.map((a) => (
                  <p key={a.id} className="mt-2 text-sm text-ink-soft">
                    J: {a.body} {a.isOfficial && <Badge variant="info" className="ml-1">Penjual</Badge>}
                  </p>
                ))}
              </div>
            ))}
          </div>
          <div>
            <h3 className="mb-3 font-display text-lg font-bold text-ink">Ajukan Pertanyaan</h3>
            <QnaForm productId={product.id} slug={product.slug} />
          </div>
        </div>
      </section>

      {/* Related */}
      {related.length > 0 && (
        <section>
          <SectionHeader title="Kamu Mungkin Suka" href="/shop" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
            {related.slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={toCardData(p)} wishlisted={wl.has(p.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
