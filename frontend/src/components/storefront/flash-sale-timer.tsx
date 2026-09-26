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
    <div className={`flex items-center ${compact ? "gap-0.5" : "gap-2"}`} data-testid="flash-timer">
      {cells.map((c, i) => (
        <div key={i} className={`flex items-center ${compact ? "gap-0.5" : "gap-2"}`}>
          <div className="flex flex-col items-center">
            <span
              className={`flex items-center justify-center rounded-lg bg-black font-display font-bold text-white ${
                compact ? "h-9 w-9 text-xs sm:h-10 sm:w-10 sm:text-sm" : "h-11 w-11 text-lg"
              }`}
            >
              {c.v}
            </span>
            <span className={`mt-1 font-semibold text-ink-muted ${compact ? "text-[8px] sm:text-[9px]" : "text-[10px]"}`}>
              {c.l}
            </span>
          </div>
          {i < cells.length - 1 && (
            <span className={`pb-3 font-bold text-ink ${compact ? "text-xs" : "text-base"}`}>:</span>
          )}
        </div>
      ))}
    </div>
  );
}
