"use client";
import Image from "next/image";
import { JetSellerWordmark } from "@/components/brand/wordmark";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  makeDefault,
  type StoreAppearanceV1,
} from "@/modules/appearance/schema";
const Context = createContext<{
  config: StoreAppearanceV1;
  preview: boolean;
  logoUrl?: string;
}>({ config: makeDefault(), preview: false });
export function AppearanceProvider({
  config,
  preview = false,
  logoUrl,
  children,
}: {
  config: StoreAppearanceV1;
  preview?: boolean;
  logoUrl?: string;
  children: React.ReactNode;
}) {
  return (
    <Context.Provider value={{ config, preview, logoUrl }}>
      {children}
    </Context.Provider>
  );
}
export const useAppearance = () => useContext(Context);
export function StoreLogo() {
  const { config, preview, logoUrl } = useAppearance(),
    i = config.identity;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [i.logoAssetId, logoUrl]);
  const show =
    i.mode !== "text" &&
    i.logoAssetId &&
    !failed &&
    (!preview || Boolean(logoUrl));
  // Keep the two-color mark on the white demo preset. Custom header/footer
  // palettes retain their validated inherited foreground instead of a red-on-red mark.
  const wordmark = i.name === "JetSeller" &&
    config.colors.header.toUpperCase() === "#FFFFFF" &&
    config.colors.footer.toUpperCase() === "#FFFFFF" &&
    config.colors.pageBg.toUpperCase() === "#FFFFFF" &&
    !config.gradients.header.enabled &&
    !config.gradients.footer.enabled;
  return (
    <span
      className="inline-flex max-w-full items-center gap-2"
      style={{ justifyContent: i.position === "center" ? "center" : undefined }}
    >
      {/* Only a typed asset ID can construct a source; no arbitrary remote URL. */}
      {show && (
        <Image
          unoptimized
          src={preview ? logoUrl! : `/api/v1/store-branding/${i.logoAssetId}`}
          alt={i.mode === "image" ? i.name : ""}
          width={i.logoWidth}
          height={48}
          style={{
            width: i.logoWidth,
            maxWidth: "100%",
            maxHeight: 64,
            objectFit: "contain",
          }}
          onError={() => setFailed(true)}
        />
      )}
      {(i.mode !== "image" || !show) && <span>{wordmark ? <JetSellerWordmark sellerColor={config.colors.text} /> : i.name}</span>}
    </span>
  );
}
export function PublishedVersionSync({ version }: { version: number }) {
  const path = usePathname(),
    router = useRouter(),
    last = useRef(0);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (Date.now() - last.current < 5000) return;
      last.current = Date.now();
      try {
        const r = await fetch("/api/v1/store-appearance/version", {
          cache: "no-store",
        });
        if (!r.ok) return;
        const v = await r.json();
        if (alive && Number.isSafeInteger(v.version) && v.version !== version) {
          router.refresh();
        }
      } catch {}
    };
    void check();
    window.addEventListener("focus", check);
    return () => {
      alive = false;
      window.removeEventListener("focus", check);
    };
  }, [path, router, version]);
  return null;
}
