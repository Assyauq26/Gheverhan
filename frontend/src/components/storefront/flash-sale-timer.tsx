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

  if (compact) {
    return (
      <div
        className="grid w-[124px] grid-cols-[36px_8px_36px_8px_36px] items-start justify-center"
        data-testid="flash-timer"
      >
        {cells.map((c, i) => (
          <div key={c.l} className="contents">
            <div className="flex min-w-0 flex-col items-center">
              <span className="flex h-10 w-9 items-center justify-center rounded-[7px] border border-black/[0.06] bg-white font-display text-[15px] font-bold text-ink shadow-[0_2px_8px_rgba(0,0,0,0.035)] sm:h-10 sm:text-[15px]">
                {c.v}
              </span>
              <span className="mt-1 text-[7px] font-semibold uppercase leading-none tracking-[0.02em] text-ink-muted sm:text-[8px]">
                {c.l}
              </span>
            </div>
            {i < cells.length - 1 && (
              <span className="flex h-10 w-2 items-center justify-center text-xs font-bold leading-none text-ink sm:text-sm">
                :
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2" data-testid="flash-timer">
      {cells.map((c, i) => (
        <div key={c.l} className="flex items-start gap-2">
          <div className="flex flex-col items-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-[7px] border border-black/[0.06] bg-white font-display text-lg font-bold text-ink shadow-[0_2px_8px_rgba(0,0,0,0.035)]">
              {c.v}
            </span>
            <span className="mt-1 text-[10px] font-semibold uppercase leading-none tracking-[0.02em] text-ink-muted">
              {c.l}
            </span>
          </div>
          {i < cells.length - 1 && (
            <span className="pt-2 text-base font-bold leading-none text-ink">:</span>
          )}
        </div>
      ))}
    </div>
  );
}
