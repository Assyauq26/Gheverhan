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
 * Let next/link own link transitions. Previously onNavigate.preventDefault()
 * cancelled its native transition and re-issued router.push inside a second
 * React transition; this introduces duplicate routing ownership and can stall
 * streamed RSC navigation, especially after multiple back/forward actions.
 *
 * useLinkStatus (available in Next 15.3+) reports the actual link pending
 * state, without overriding native click/scroll/history behavior.
 */
function LinkPendingFeedback() {
  const { pending } = useLinkStatus();
  return pending ? (
    <span role="status" aria-live="polite" data-testid="navigation-pending" className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 bg-black">
      <span className="sr-only">Memuat halaman…</span>
    </span>
  ) : null;
}

const NavigationLink = forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<typeof NextLink>>(function NavigationLink({ children, ...props }, ref) {
  return <NextLink {...props} ref={ref}>
    {children}
    <LinkPendingFeedback />
  </NextLink>;
});
export default NavigationLink;
