"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppearanceProvider, StoreLogo } from "@/components/appearance/context";
import { makeDefault, type StoreAppearanceV1 } from "@/modules/appearance/schema";

type IdentitySnapshot = { identity: StoreAppearanceV1["identity"]; draftVersion: number; publishedVersion: number };
const Context = createContext<IdentitySnapshot | null>(null);
const eventName = "store-dashboard-identity-changed";
/** Same-origin invalidation only; brand/secret values never enter browser storage or messages. */
export function notifyDashboardIdentityChanged() {
  window.dispatchEvent(new Event(eventName));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(eventName);
    channel.postMessage("refresh"); channel.close();
  }
}
export function DashboardIdentityProvider({ initial, children }: { initial: IdentitySnapshot; children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState(initial);
  const router = useRouter();
  const latest = useRef(initial);
  useEffect(() => {
    if (initial.draftVersion >= latest.current.draftVersion && initial.publishedVersion >= latest.current.publishedVersion) {
      latest.current = initial; setSnapshot(initial);
    }
  }, [initial]);
  useEffect(() => {
    const controller = new AbortController(); let inFlight = false, queued = false;
    async function check() {
      if (document.visibilityState === "hidden") return;
      if (inFlight) { queued = true; return; }
      inFlight = true;
      try {
        const response = await fetch("/api/v1/admin/store-identity", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const value = await response.json();
        if (value.success && !controller.signal.aborted &&
          (value.data.draftVersion !== latest.current.draftVersion || value.data.publishedVersion !== latest.current.publishedVersion)) {
          latest.current = value.data; setSnapshot(value.data);
          router.refresh();
        }
      } catch { /* Keep last authenticated identity during transient network failure. */ }
      finally { inFlight = false; if (queued && !controller.signal.aborted) { queued = false; void check(); } }
    }
    const refresh = () => { void check(); };
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(eventName) : null;
    if (channel) channel.onmessage = refresh;
    window.addEventListener(eventName, refresh); window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      controller.abort(); channel?.close(); window.clearInterval(timer);
      window.removeEventListener(eventName, refresh); window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);
  return <Context.Provider value={snapshot}>{children}</Context.Provider>;
}
export function DashboardStoreName() { return <>{useContext(Context)!.identity.name}</>; }
export function DashboardWordmark() {
  const { identity } = useContext(Context)!;
  const config = { ...makeDefault(), identity: { ...identity, logoWidth: Math.min(identity.logoWidth, identity.mode === "both" ? 48 : 160) } };
  return <span data-testid="dashboard-wordmark" className="inline-block max-w-full align-middle [&>span]:min-w-0 [&>span>span]:truncate" title={identity.name}>
    <AppearanceProvider config={config} preview logoUrl={identity.logoAssetId ? `/api/v1/admin/store-identity/logo?id=${identity.logoAssetId}` : undefined}><StoreLogo /></AppearanceProvider>
  </span>;
}
