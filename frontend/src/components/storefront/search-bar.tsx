"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";

export function SearchBar({ className = "" }: { className?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <form onSubmit={submit} className={`relative flex-1 ${className}`} data-testid="search-bar">
      <Search
        size={18}
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted"
      />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cari produk, brand, atau kategori..."
        data-testid="search-input"
        className="h-11 w-full rounded-full border border-line bg-surface pl-11 pr-12 text-sm text-ink placeholder:text-ink-muted focus:border-black focus:bg-white focus:outline-none focus:ring-2 focus:ring-black/10"
      />
      <button
        type="submit"
        aria-label="Filter"
        className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft hover:bg-line/60"
      >
        <SlidersHorizontal size={16} />
      </button>
    </form>
  );
}
