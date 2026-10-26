import Link from "@/components/ui/navigation";
import Image from "next/image";
import { formatIDR, effectivePrice, discountPercent } from "@/lib/money";
import { activeScheduledFlashPrice } from "@/modules/promotions/scheduled-flash-sale";
import { Rating } from "@/components/ui/rating";
import { Badge } from "@/components/ui/badge";
import { WishlistButton } from "./wishlist-button";
import { QuickAddButton } from "./quick-add-button";

export interface ProductCardData {
  id: string;
  slug: string;
  name: string;
  brandName?: string | null;
  image: string | null;
  basePrice: number;
  salePrice: number | null;
  ratingAvg: number;
  reviewCount: number;
  variantId: string | null;
}

export function ProductCard({
  product,
  wishlisted = false,
  compact = false,
  featured = false,
  preview = false,
}: {
  product: ProductCardData;
  wishlisted?: boolean;
  compact?: boolean;
  /** Product Pilihan uses a simplified card with no wishlist/add-to-cart actions. */
  featured?: boolean;
  preview?: boolean;
}) {
  const price = effectivePrice(product.basePrice, product.salePrice);
  const pct = discountPercent(product.basePrice, product.salePrice);

  return (
    <article
      data-theme-target="highlightCard"
      className="group relative overflow-hidden rounded-xl border border-line/70 bg-white p-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.05)] transition-shadow duration-200 hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)]"
      data-testid={`product-card-${product.slug}`}
    >
      <Link prefetch={preview ? false : undefined} href={`/product/${product.slug}`} className="block">
        <div className="relative aspect-square overflow-hidden rounded-xl bg-surface">
          {product.image ? (
            <Image
              src={product.image}
              alt={product.name}
              fill
              sizes="(max-width:768px) 50vw, 25vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-ink-muted">
              No image
            </div>
          )}

          {pct > 0 && !compact && (
            <div className="absolute left-2 top-2 z-10">
              <Badge variant="sale">{pct}%</Badge>
            </div>
          )}

        </div>
      </Link>
      {/* A button must never be nested in a link: invalid interactive HTML
          can yield unpredictable click/hydration behavior in Chromium. */}
      {!featured && !preview && (
        <div className="absolute right-3.5 top-3.5 z-10">
          <WishlistButton productId={product.id} initialActive={wishlisted} />
        </div>
      )}

      <div className="px-0.5 pb-1 pt-2">
        <Rating value={product.ratingAvg} count={product.reviewCount} />
        <Link prefetch={preview ? false : undefined} href={`/product/${product.slug}`}>
          <h3 className="mt-1 line-clamp-1 text-sm font-semibold text-ink">
            {product.name}
          </h3>
        </Link>

        {featured && pct > 0 ? (
          <div className="mt-1 flex min-w-0 items-center gap-1 whitespace-nowrap">
            <span data-theme-role="price" data-discount={pct > 0} className="font-display text-sm font-extrabold leading-tight text-ink">
              {formatIDR(price)}
            </span>
            <span className="shrink-0 text-[10px] leading-tight text-ink-muted line-through">
              {formatIDR(product.basePrice)}
            </span>
          </div>
        ) : (
          <div className="mt-1 flex items-center justify-between gap-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span data-theme-role="price" data-discount={pct > 0} className="font-display text-base font-extrabold leading-tight text-ink">
                {formatIDR(price)}
              </span>
              {pct > 0 && (
                <span className="text-xs leading-tight text-ink-muted line-through">
                  {formatIDR(product.basePrice)}
                </span>
              )}
            </div>
            {!preview && <QuickAddButton
              slug={product.slug}
              testId={product.variantId ?? product.id}
              className="shrink-0"
            />}
          </div>
        )}
      </div>
    </article>
  );
}

export function toCardData(p: {
  id: string;
  slug: string;
  name: string;
  basePrice: number;
  salePrice: number | null;
  flashSalePrice?: number | null;
  flashSaleStartsAt?: Date | null;
  flashSaleEndsAt?: Date | null;
  ratingAvg: number;
  reviewCount: number;
  brand?: { name: string } | null;
  images: { url: string }[];
  variants: { id: string }[];
  _count?: { variants: number };
}): ProductCardData {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brandName: p.brand?.name ?? null,
    image: p.images[0]?.url ?? null,
    basePrice: p.basePrice,
    salePrice: activeScheduledFlashPrice(p) ?? p.salePrice,
    ratingAvg: p.ratingAvg,
    reviewCount: p.reviewCount,
    // Identifier hint for selectors only; mutation always uses fresh metadata.
    variantId: p._count?.variants === 1 ? p.variants.find(() => true)?.id ?? null : null,
  };
}
