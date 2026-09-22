"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Slide {
  eyebrow: string;
  title: string;
  subtitle: string;
  image: string;
  href: string;
}

export function HeroCarousel({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);
  const total = slides.length;

  useEffect(() => {
    const t = setInterval(() => setIndex((i) => (i + 1) % total), 6000);
    return () => clearInterval(t);
  }, [total]);

  const slide = slides[index];

  return (
    <div className="relative overflow-hidden rounded-3xl bg-surface" data-testid="hero-carousel">
      <div className="grid md:grid-cols-2">
        <div className="order-2 flex flex-col justify-center p-6 md:order-1 md:p-12">
          <span className="text-xs font-bold uppercase tracking-widest text-ink-soft">
            {slide.eyebrow}
          </span>
          <h1 className="mt-3 font-display text-4xl font-black leading-[0.95] text-ink md:text-6xl">
            {slide.title}
          </h1>
          <p className="mt-4 max-w-sm text-sm text-ink-soft md:text-base">
            {slide.subtitle}
          </p>
          <Button asChild className="mt-6 w-fit" size="lg" data-testid="hero-cta">
            <Link href={slide.href}>
              Shop Now <ArrowRight size={18} />
            </Link>
          </Button>
        </div>
        <div className="relative order-1 h-56 md:order-2 md:h-[420px]">
          <Image src={slide.image} alt={slide.title} fill className="object-cover" priority sizes="(max-width:768px) 100vw, 50vw" />
        </div>
      </div>

      <button
        onClick={() => setIndex((i) => (i - 1 + total) % total)}
        aria-label="Sebelumnya"
        className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow md:flex"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        onClick={() => setIndex((i) => (i + 1) % total)}
        aria-label="Berikutnya"
        className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow md:flex"
      >
        <ChevronRight size={18} />
      </button>

      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            aria-label={`Slide ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-black" : "w-1.5 bg-ink-muted/40"}`}
          />
        ))}
      </div>
    </div>
  );
}
