/** Shared text-only mark; no remote asset, script, or trademark dependency. */
export function JetSellerWordmark({ sellerColor = "#111418" }: { sellerColor?: string }) {
  return <span className="jetseller-wordmark"><span style={{ color: "#E1251B" }}>Jet</span><span style={{ color: sellerColor }}>Seller</span></span>;
}
