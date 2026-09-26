"use client";

import { useEffect, useState } from "react";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

type FlashSaleTimerProps = {
  endsInSeconds?: number;
  compact?: boolean;
};

export function FlashSaleTimer({ endsInSeconds = 8127, compact = false }: FlashSaleTimerProps) {
  const [remaining, setRemaining] = useState(endsInSeconds);

  useEffect(() => {
    const t = setInterval(() => setRemaining((r) => (r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  const cells = [
    { v: pad(h), l: "JAM" },
    { v: pad(m), l: "MENIT" },
    { v: pad(s), l: "DETIK" },
  ];

  return (
    <div
      className={`flex items-start justify-between ${compact ? "w-[180px] gap-1 sm:w-[190px] sm:gap-1.5" : "gap-2"}`}
      data-testid="flash-timer"
    >
      {cells.map((c, i) => (
        <div key={i} className={`flex items-start ${compact ? "gap-1 sm:gap-1.5" : "gap-2"}`}>
          <div className="flex flex-col items-center">
            <span
              className={`flex items-center justify-center border border-black/[0.06] bg-white font-display font-bold text-ink shadow-[0_2px_8px_rgba(0,0,0,0.035)] ${
                compact
                  ? "h-10 w-10 rounded-[7px] text-sm sm:h-11 sm:w-11 sm:text-base"
                  : "h-11 w-11 rounded-[7px] text-lg"
              }`}
            >
              {c.v}
            </span>
            <span
              className={`mt-1 font-semibold uppercase leading-none tracking-[0.02em] text-ink-muted ${
                compact ? "text-[8px] sm:text-[9px]" : "text-[10px]"
              }`}
            >
              {c.l}
            </span>
          </div>
          {i < cells.length - 1 && (
            <span className={`pt-2 font-bold leading-none text-ink ${compact ? "text-sm" : "text-base"}`}>:</span>
          )}
        </div>
      ))}
    </div>
  );
}
