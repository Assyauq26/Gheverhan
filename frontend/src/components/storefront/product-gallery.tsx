"use client";

import { useState } from "react";
import Image from "next/image";
import { useProductSelection } from "./product-selection";
import { cn } from "@/lib/utils";

export function ProductGallery({
  images,
  name,
}: {
  images: { url: string; alt: string }[];
  name: string;
}) {
  const context = useProductSelection();
  const [choice, setChoice] = useState<{
    option: string;
    index: number;
  } | null>(null);
  const list = images.length ? images : [{ url: "", alt: name }];
  const option = context?.image?.url || "";
  const active =
    choice?.option === option ? Math.min(choice.index, list.length - 1) : 0;
  const displayed =
    choice?.option === option ? list[active] : (context?.image ?? list[0]);

  return (
    <div className="space-y-3" data-testid="product-gallery">
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-surface">
        {displayed.url && (
          <Image
            src={displayed.url}
            alt={displayed.alt || name}
            fill
            priority
            sizes="(max-width:768px) 100vw, 50vw"
            className="object-cover"
          />
        )}
      </div>
      {list.length > 1 && (
        <div className="flex max-w-full gap-3 overflow-x-auto p-1">
          {list.map((img, i) => (
            <button
              key={i}
              onClick={() => setChoice({ option, index: i })}
              aria-label={`Lihat foto produk ${i + 1}`}
              aria-pressed={choice?.option === option && i === active}
              className={cn(
                "relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface ring-2 transition-all",
                choice?.option === option && i === active
                  ? "ring-black"
                  : "ring-transparent",
              )}
            >
              <Image
                src={img.url}
                alt=""
                fill
                className="object-cover"
                sizes="64px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
