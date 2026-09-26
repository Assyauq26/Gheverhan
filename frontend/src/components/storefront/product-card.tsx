import Link from "next/link";
import Image from "next/image";
import { formatIDR, effectivePrice, discountPercent } from "@/lib/money";
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
}: {
  product: ProductCardData;
  wishlisted?: boolean;
  compact?: boolean;
}) {
  const price = effectivePrice(product.basePrice, product.salePrice);
  const pct = discountPercent(product.basePrice, product.salePrice);

  return (
    <article
      className="group relative overflow-hidden rounded-xl border border-line/70 bg-white p-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.05)] transition-shadow duration-200 hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)]"
      data-testid={`product-card-${product.slug}`}
    >
      <Link href={`/product/${product.slug}`} className="block">
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

          <div className="absolute right-2 top-2 z-10">
            <WishlistButton productId={product.id} initialActive={wishlisted} />
          </div>
        </div>
      </Link>

      <div className="px-0.5 pb-1 pt-2 pr-10">
        <Rating value={product.ratingAvg} count={product.reviewCount} />
        <Link href={`/product/${product.slug}`}>
          <h3 className="mt-1 line-clamp-1 text-sm font-semibold text-ink">
            {product.name}
          </h3>
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="font-display text-base font-extrabold text-ink">
            {formatIDR(price)}
          </span>
          {pct > 0 && (
            <span className="text-xs text-ink-muted line-through">
              {formatIDR(product.basePrice)}
            </span>
          )}
        </div>
      </div>

      <div className="absolute bottom-2.5 right-1.5">
        <QuickAddButton variantId={product.variantId} />
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
  ratingAvg: number;
  reviewCount: number;
  brand?: { name: string } | null;
  images: { url: string }[];
  variants: { id: string }[];
}): ProductCardData {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brandName: p.brand?.name ?? null,
    image: p.images[0]?.url ?? null,
    basePrice: p.basePrice,
    salePrice: p.salePrice,
    ratingAvg: p.ratingAvg,
    reviewCount: p.reviewCount,
    variantId: p.variants[0]?.id ?? null,
  };
}
