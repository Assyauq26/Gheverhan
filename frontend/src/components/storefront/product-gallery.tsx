"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useProductSelection } from "./product-selection";

export function ProductGallery({
  images,
  name,
}: {
  images: { url: string; alt: string }[];
  name: string;
}) {
  const selection = useProductSelection();
  const optionImage = selection?.image;
  // Keep option photos inside the same carousel, without duplicating a gallery photo.
  const list = optionImage?.url
    ? [optionImage, ...images.filter((image) => image.url !== optionImage.url)]
    : images;
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const previousOption = useRef(optionImage?.url);
  const touchStart = useRef<number | null>(null);
  const focusDot = useRef(false);
  const dotControls = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusDot.current) {
      dotControls.current
        ?.querySelector<HTMLButtonElement>('button[aria-current="true"]')
        ?.focus({ preventScroll: true });
      focusDot.current = false;
    }
  }, [active]);
  useEffect(() => {
    if (previousOption.current !== optionImage?.url) {
      previousOption.current = optionImage?.url;
      setActive(0);
    }
  }, [optionImage?.url]);
  const index = Math.min(active, Math.max(0, list.length - 1));
  const displayed = list[index];
  const dotStart = Math.max(0, Math.min(index - 2, list.length - 5));
  const dots = list.length > 5 ? list.slice(dotStart, dotStart + 5) : list;

  function swipe(end: number) {
    if (touchStart.current == null || list.length < 2) return;
    const delta = end - touchStart.current;
    touchStart.current = null;
    if (Math.abs(delta) < 45) return;
    setActive((previous) =>
      Math.max(0, Math.min(list.length - 1, previous + (delta < 0 ? 1 : -1))),
    );
  }

  return (
    <div
      className="min-w-0"
      data-testid="product-gallery"
      aria-busy={!ready}
      aria-label="Galeri produk"
    >
      <div
        className="pdp-gallery-frame"
        onTouchStart={(event) => {
          touchStart.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => swipe(event.changedTouches[0]?.clientX ?? 0)}
      >
        {displayed?.url ? (
          <Image
            key={displayed.url}
            src={displayed.url}
            alt={displayed.alt || name}
            fill
            priority={index === 0}
            sizes="(max-width: 767px) 100vw, (max-width: 1280px) 50vw, 560px"
            className="pdp-gallery-image"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-zinc-100 text-sm text-zinc-400">
            Foto produk belum tersedia
          </div>
        )}
        {list.length > 1 && (
          <div
            ref={dotControls}
            className="pdp-gallery-dots"
            aria-label="Pilih foto produk"
          >
            {dots.map((image, offset) => {
              const i = list.length > 5 ? dotStart + offset : offset;
              return (
                <button
                  type="button"
                  key={image.url}
                  aria-label={`Lihat foto produk ${i + 1} dari ${list.length}`}
                  aria-current={index === i ? "true" : undefined}
                  onClick={() => setActive(i)}
                  className="grid h-11 w-11 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  onKeyDown={(event) => {
                    if (
                      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    ) {
                      event.preventDefault();
                      const key = event.key;
                      focusDot.current = true;
                      setActive((current) =>
                        key === "Home"
                          ? 0
                          : key === "End"
                            ? list.length - 1
                            : Math.max(
                                0,
                                Math.min(
                                  list.length - 1,
                                  current + (key === "ArrowRight" ? 1 : -1),
                                ),
                              ),
                      );
                    }
                  }}
                >
                  <span
                    className="pdp-gallery-dot"
                    aria-current={index === i ? "true" : undefined}
                  />
                </button>
              );
            })}
            {list.length > 5 && (
              <span className="pdp-gallery-counter">
                {index + 1}/{list.length}
              </span>
            )}
          </div>
        )}
      </div>
      {list.length > 1 && (
        <div
          className="pdp-thumb-bar no-scrollbar"
          aria-label="Foto produk lainnya"
        >
          {list.map((image, i) => (
            <button
              type="button"
              key={image.url}
              onClick={() => setActive(i)}
              aria-label={`Lihat foto produk ${i + 1}`}
              aria-pressed={index === i}
              className="pdp-gallery-thumb focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Image
                src={image.url}
                alt=""
                fill
                sizes="64px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
