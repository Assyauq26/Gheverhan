"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function ProductGallery({
  images,
  name,
}: {
  images: { url: string; alt: string }[];
  name: string;
}) {
  const [active, setActive] = useState(0);
  const list = images.length ? images : [{ url: "", alt: name }];

  return (
    <div className="space-y-3" data-testid="product-gallery">
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-surface">
        {list[active].url && (
          <Image
            src={list[active].url}
            alt={list[active].alt || name}
            fill
            priority
            sizes="(max-width:768px) 100vw, 50vw"
            className="object-cover"
          />
        )}
      </div>
      {list.length > 1 && (
        <div className="flex gap-3">
          {list.map((img, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={cn(
                "relative h-16 w-16 overflow-hidden rounded-xl bg-surface ring-2 transition-all",
                i === active ? "ring-black" : "ring-transparent",
              )}
            >
              <Image src={img.url} alt="" fill className="object-cover" sizes="64px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
