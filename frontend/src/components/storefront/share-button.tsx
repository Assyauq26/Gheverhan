"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ShareButton({ title, iconOnly = false }: { title: string; iconOnly?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {}
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <Button type="button" variant={iconOnly ? "outline" : "ghost"} size={iconOnly ? "icon" : "sm"} className={iconOnly ? "pdp-header-action h-11 w-11 border-0 bg-white/90 shadow-sm backdrop-blur" : ""} aria-label={copied ? "Tautan produk tersalin" : "Bagikan produk"} onClick={share} data-testid="share-btn">
      {copied ? <Check size={16} /> : <Share2 size={16} />}
      {!iconOnly && (copied ? "Tersalin" : "Bagikan")}
    </Button>
  );
}
