"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface Slide {
  image: string;
  alt?: string;
}

export function HeroCarousel({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);
  const total = slides.length;

  useEffect(() => {
    if (total <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % total), 6000);
    return () => clearInterval(t);
  }, [total]);

  if (!slides.length) return null;

  const slide = slides[index];

  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-surface"
      data-testid="hero-carousel"
    >
      <div className="relative aspect-[16/8] w-full md:aspect-[3/1]">
        <Image
          src={slide.image}
          alt={slide.alt ?? "Gheverhan collection"}
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
      </div>

      {total > 1 && (
        <div
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5"
          aria-label="Pilihan banner"
        >
          {slides.map((_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-6 bg-black" : "w-1.5 bg-white/70"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
