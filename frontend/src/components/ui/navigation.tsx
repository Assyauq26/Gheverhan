"use client";

import { createContext, forwardRef, useContext, useState, useTransition, type ComponentPropsWithoutRef, type ReactNode } from "react";
import NextLink from "next/link";
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

/** Keep Next prefetch and native modified-click behavior; add transition feedback. */
const NavigationLink = forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<typeof NextLink>>(function NavigationLink({ children, onNavigate, ...props }, ref) {
  const navigation = useNavigation();
  const pending = navigation?.pending && navigation.destination === props.href;
  return <NextLink {...props} ref={ref} aria-busy={pending || undefined} data-pending={pending || undefined} onNavigate={event => {
    // Existing custom navigation handlers retain control of their own event.
    if (onNavigate) { onNavigate(event); return; }
    if (!navigation || typeof props.href !== "string" || props.replace) return;
    event.preventDefault();
    if (!pending) navigation.navigate(props.href, props.scroll);
  }}>{children}</NextLink>;
});
export default NavigationLink;
