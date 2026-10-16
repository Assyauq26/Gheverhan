"use client";

import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useState, useTransition, type ComponentPropsWithoutRef, type ReactNode } from "react";
import NextLink, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";

type NavigationContextValue = {
  pending: boolean;
  destination: string;
  navigate: (href: string, scroll?: boolean) => void;
  trackLinkPending: (id: string, href: string, pending: boolean) => void;
};
const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [formPending, startTransition] = useTransition();
  const [formDestination, setFormDestination] = useState("");
  const [pendingLinks, setPendingLinks] = useState<Record<string, string>>({});

  const trackLinkPending = useCallback((id: string, href: string, pending: boolean) => {
    setPendingLinks(previous => {
      if (pending && previous[id] === href) return previous;
      if (!pending && !(id in previous)) return previous;
      const next = { ...previous };
      if (pending) next[id] = href;
      else delete next[id];
      return next;
    });
  }, []);

  function navigate(href: string, scroll = true) {
    setFormDestination(href);
    startTransition(() => router.push(href, { scroll }));
  }

  const activeLink = Object.values(pendingLinks)[0];
  const pending = formPending || activeLink !== undefined;
  const destination = activeLink ?? formDestination;
  return <NavigationContext.Provider value={{ pending, destination, navigate, trackLinkPending }}>
    {children}
    {pending && <div role="status" aria-live="polite" data-testid="navigation-pending" className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 bg-black"><span className="sr-only">Memuat halaman…</span></div>}
  </NavigationContext.Provider>;
}

export function useNavigation() { return useContext(NavigationContext); }

/** Observe the framework-native Link state without intercepting its navigation.
 * This must render INSIDE the NextLink child context. */
function LinkStatusReporter({ href }: { href: string }) {
  const { pending } = useLinkStatus();
  const navigation = useNavigation();
  const id = useId();
  const track = navigation?.trackLinkPending;
  useEffect(() => {
    if (!pending || !track) return;
    track(id, href, true);
    return () => track(id, href, false);
  }, [id, href, pending, track]);
  return null;
}

/** NextLink owns the route transition. Do not preventDefault and re-push it:
 * duplicate/cancelled RSC requests made pagination intermittently hang under
 * synthetic network delay. Native browser modified-click behavior is preserved. */
const NavigationLink = forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<typeof NextLink>>(function NavigationLink({ children, onNavigate, ...props }, ref) {
  const navigation = useNavigation();
  const href = typeof props.href === "string" ? props.href : "";
  const pending = !!navigation?.pending && navigation.destination === href;
  return <NextLink {...props} ref={ref} onNavigate={onNavigate} aria-busy={pending || undefined} data-pending={pending || undefined}>
    {children}
    {href && <LinkStatusReporter href={href} />}
  </NextLink>;
});
export default NavigationLink;
