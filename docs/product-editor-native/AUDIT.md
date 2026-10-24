# Product editor audit and implementation

Baseline: main b719e9db83e7c7065a38421f28727f80b880c355 (PR #101). No new reference screenshots were attached to the request; existing committed screenshots and current components establish visual context.

## Findings

- Gallery and option ordering exposed arrow buttons; group sort mode opened an overflow menu rather than supporting a pointer gesture. Reordering must preserve group/value identities and combination keys.
- Gallery upload accepted a single file; sequential upload staging already provides session ownership, request idempotency, durable cancellation and TTL cleanup. Reuse that contract for a bounded multi-file queue.
- Product editor inherited dashboard mobile header and bottom navigation, while the variation dialog had its own chrome. Scope shell suppression to product editing.
- Save action was static and publish was separate. Share the domain schema for local readiness; permissions, relation ownership, SKU/slug uniqueness and concurrent revision checks remain server authoritative.
- Drafts require name (2+), slug, positive base price, and at least one valid SKU. Images and shipping weight may be absent. Preserve this minimum contract rather than widening all creation and transaction consumers.
- Variant price overrides are authoritative for checkout. Derive product fallback from the cheapest effective SKU only when every row has an explicit price; preserve legacy inherited prices otherwise. Preserve scheduled flash-sale protection.
- Product has careInstruction but no size-chart metadata. Add nullable JSON, bounded server validation, and reuse owned ProductImage assets through the existing option-media staging path. Keep chart images out of the gallery.
- Existing SKU stock/history guards, serializable writes, inventory adjustment permissions, cart/order references and order image protection must remain intact. Changing display order never regenerates SKU identities.
- variation-editor.css accumulated three visual generations and teal overrides. Consolidate scoped neutral styles and responsive dialog behavior.

## Release and recovery

Migration adds nullable Product.sizeChart and a 100KB JSON constraint; no existing row rewrite, inventory change, or destructive statement. Roll forward is preferred. To roll back application code after migration, keep the nullable column; older code ignores it. Export any chart metadata before a future reviewed column removal. Never remove historical migrations or reset production.

Public chart images use the same product-images endpoint as gallery images: published product media is public; draft/archived media follows existing staff, cart and historical order authorization. Client URLs are never accepted as chart metadata.

No production migration, merge, domain cutover or deployment is authorized by this implementation request.
