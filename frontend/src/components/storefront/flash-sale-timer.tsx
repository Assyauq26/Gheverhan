"use client";

import { useEffect, useState } from "react";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export function FlashSaleTimer({ endsInSeconds = 8127 }: { endsInSeconds?: number }) {
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
    <div className="flex items-center gap-2" data-testid="flash-timer">
      {cells.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex flex-col items-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-black font-display text-lg font-bold text-white">
              {c.v}
            </span>
            <span className="mt-1 text-[10px] font-semibold text-ink-muted">{c.l}</span>
          </div>
          {i < cells.length - 1 && <span className="pb-4 font-bold text-ink">:</span>}
        </div>
      ))}
    </div>
  );
}
