"use client";

import { createContext, forwardRef, useContext, useState, useTransition, type ComponentPropsWithoutRef, type ReactNode } from "react";
import NextLink, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";

const NavigationContext = createContext<{
  pending: boolean;
  destination: string;
  navigate: (href: string, scroll?: boolean) => void;
} | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [destination, setDestination] = useState("");
  function navigate(href: string, scroll = true) {
    setDestination(href);
    startTransition(() => router.push(href, { scroll }));
  }
  return <NavigationContext.Provider value={{ pending, destination, navigate }}>
    {children}
    {pending && <div role="status" aria-live="polite" data-testid="navigation-pending" className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 bg-black"><span className="sr-only">Memuat halaman…</span></div>}
  </NavigationContext.Provider>;
}

export function useNavigation() { return useContext(NavigationContext); }

/**
 * Native Next.js link navigation is the source of truth for anchor clicks.
 * IMPORTANT: Never call preventDefault()/router.push() from onNavigate.
 * Doing both has led to aborted RSC transitions and intermittent stale pages.
 *
 * Link-level pending feedback comes from Next's own useLinkStatus hook, so the
 * loading indicator cannot become stuck due to a competing transition.
 */
function NativeLinkPendingFeedback() {
  const { pending } = useLinkStatus();
  return pending ? (
    <span role="status" aria-live="polite" data-testid="navigation-pending"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 block h-1 bg-black">
      <span className="sr-only">Memuat halaman…</span>
    </span>
  ) : null;
}

const NavigationLink = forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<typeof NextLink>>(function NavigationLink({ children, onNavigate, ...props }, ref) {
  return <NextLink {...props} ref={ref} onNavigate={onNavigate}>
    {children}
    <NativeLinkPendingFeedback />
  </NextLink>;
});
export default NavigationLink;
