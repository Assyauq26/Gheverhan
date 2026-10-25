# Storefront Customize architecture

## Working contract and baseline

Source main: `b452fd10d52e9d439a58b9d0466ba4991ac8dcf0` (PR #102). Implementation branch: `feat/storefront-customize-theme-studio`. The pre-existing checkout was on the earlier product-editor branch; it was clean and was not overwritten. A detached baseline worktree is used for synthetic comparisons.

The complete supplied v2 specification was read before implementation. This feature does not authorize main pushes, Production migrations, releases, remote storage provisioning, or live theme changes.

Decisions confirmed with the user: storefront **and checkout** are themed; customer auth and legal pages stay neutral. Until an explicit publish, preserve the legacy look, including its existing muted text and blue link hover. Legacy fallback is separate from the ten publishable AA presets. Saving an invalid-contrast draft is allowed; publishing it is blocked. Revision zero is retained for exact legacy rollback and is the sole explicit contrast exception.

## Audit findings and customer boundaries

- Storefront layout: white shell, trust section and footer branding hardcoded; shared request-scoped identity/cart context must survive.
- Header: hardcoded wordmark, navigation and white/sticky shell; search, wishlist, session destination and `CART_COUNT_EVENT` already implement business behavior.
- Bottom nav: fixed four destinations, floating pill and active state. Keep event semantics and test IDs.
- Global CSS: blue `#2563eb` hover/focus and `#1d4ed8` pressed links; white CTA hover has separate legacy behavior. Do not silently replace these before publish.
- PDP CSS: hardcoded pill/card/quantity/CTA/gallery colors and a separate mobile wordmark. Mobile hides direct-child global shell elements: preserve that DOM shape.
- Home/shop/search/product cards: category, flash-sale, product price/badge, card and recommendation colors. Physical product swatches and product images describe merchandise, not the store palette.
- Cart/account/wishlist/checkout/payment: shared fields/buttons and semantic status panels. Theme style does not change selected SKU, cart mutations, totals, payment, shipping, history, or order snapshots.
- Checkout has a separate route shell: supply the same published theme without adding storefront bottom navigation.
- Auth uses its own `.auth-ui`, legal uses `.legal-page`; neither receives theme variables.
- Shared Button/Badge are also used in admin: expose semantic attributes/variants and apply overrides only under an active customer wrapper.
- Admin navigation, authoritative permissions, both seeds/bootstrap, transactional audit, upload origin/body guards, official storage adapters, schema/migration tests and customer domain callers were inspected.

## Data and authorization

`StoreAppearanceV1` is a strict, bounded, versioned DTO. Colors are HEX6, gradients are generated linear definitions, icons/fonts/layouts are enums, logo references are UUIDs. No raw CSS, HTML, script, external fonts, arbitrary object key or arbitrary URL is accepted. Custom links are internal-only in v1, excluding admin/API/preview targets, redirects, traversal and encoded variants.

One singleton holds a **shared saved draft** and published snapshot with independent versions. Authorized administrators intentionally share the saved draft; unsaved edits remain local. Unattached staging assets are actor/session private. Every entrypoint checks the existing server session and database permission. Only Admin and Super Admin receive the three new permissions by default; migration and both seeding entrypoints agree.

Save/discard/reset check both versions. Publish/rollback acquire the singleton advisory/row lock, validate references and contrast, update published, insert an immutable revision and audit atomically. CAS conflicts are explicit 409 errors. Rollback appends a revision and does not overwrite draft. Public reads never bootstrap rows. Invalid/unknown published payloads and transient theme reads fall back to legacy; failed writes fail closed.

New tables are additive, RLS enabled without public policies. Trusted server database access remains the existing authority. No Product, Inventory, Order, Payment or Cart table is altered. New indexes cover revision version, asset expiry/idempotency and rate-counter expiry.

## Media and provider selection

Repo deployment configuration selects `STORAGE_PROVIDER=local` with `/data/media` backed by the existing VPS volume. This is repository configuration evidence, **not inspection of Production runtime**. The official adapter also supports Supabase. A third logical namespace/bucket, `store-branding`, is added explicitly to both path validation and bucket mapping; it cannot accept PDF.

Upload requires same Origin, update permission, verified session fingerprint, bounded multipart and UUID request ID. Input must be PNG/JPEG/WebP <=2 MiB with correct magic/container ending; decode limit 16MP and max side4096, one frame. Re-encode WebP strips metadata and appended payloads are rejected. No catalog media endpoint/model is reused.

Reservations serialize per actor; at most10 active uploads/session and20 upload requests/hour/actor. Mutation counters allow60 draft operations/minute and10 publish or rollback requests/minute/actor. Counter updates are atomic. Staging expires after24h; retirement retains a24h grace. Cleanup locks the same singleton as attachment and never deletes a draft/published/history reference. Revisions are retained and paginated25 at a time.

Public image reads check the **current published reference**, not merely whether an asset was ever public. Private reads require read permission plus staging ownership/session or an authorized shared draft/history reference. Images are served unoptimized so Next's image cache cannot bypass reference revocation. Public bytes require revalidation; private bytes and admin responses are no-store. Asset IDs/audit metadata contain no copied user PII or secrets.

## SSR, cache and preview isolation

The validated mapper creates only known CSS variables on `.storefront-root`. Legacy emits no variables and leaves existing styles active. Published styles render in initial server HTML. The published reader has a60-second tagged cache and request deduplication; only committed publish/rollback invalidates its tag. Auth/draft are never put in that cache.

A published-version-only no-store probe on pathname/focus, throttled5 seconds, refreshes persistent Next15 layouts after a version change. It does not fetch initial CSS or expose draft. Already-open idle pages update on focus/navigation; there is no realtime push guarantee.

Admin uses controlled state, typed actions, explicit save and publish confirmation. Local cancel, server discard and reset-to-preset are distinct. Dirty protection covers links, unload and Back/Forward using the reviewed navigation-index approach from main.

Protected preview is outside admin chrome and uses shared header, nav, ProductCard presentation, Button and PDP styling with synthetic catalog data. The sandbox allows scripts but **not same-origin/forms/popups/top-navigation**. CSP blocks connections and forms. Preview suppresses transactional components, search submit, navigation and prefetch. Parent messages validate source and a random channel nonce; child validates parent source/origin/nonce and schema. Authorized logo bytes become a temporary Blob URL. No customer identity/session data enters the frame.

Preview is a representative component gallery, not a live customer checkout session. Existing cart/checkout mutation paths remain exclusively in customer components.

## Failure and compatibility edges

No record, unavailable database, unknown schema, corrupt JSON: public safe fallback. Admin persistence failures are shown and do not fake success. Concurrent tabs must reload rather than overwrite. Publish with a missing/foreign/expired logo is rejected. Old logo requests stop working after reference change, while retained history can still restore the bytes. A DB/storage failure leaves cleanup records retryable.

The theme cannot guarantee contrast inside product photography; hero imagery has no editable text overlay. Core commerce destinations and legal destinations remain fixed. New gradients, preset tokens and all declared foreground/state pairs are server checked before publication.

## Implemented admin HTTP interface

`GET /api/v1/admin/store-appearance` requires Customize read plus backoffice identity and returns the saved draft, published snapshot and both versions with private/no-store headers. `POST` accepts `{kind, draftVersion, publishedVersion, config?, revision?}` for save/discard/reset/publish/rollback. It bounds streamed JSON to40,000 bytes, requires same Origin, and delegates to the exact authorization/transaction/cache executor used by server actions. Transport errors include401/403,409 conflict,413 payload limit and422 validation; server-action clients retain the existing `runAction` envelope with `httpStatus:409` on conflicts.

Preview logo bytes are fetched once per immutable asset ID into page memory and sent once per iframe handshake. Color/layout edits send only the validated configuration. Blob URLs are retained for the matching ID, revoked on replacement/unmount, and never persisted to browser storage. Browser regression verifies zero private-logo reads while editing palettes/layouts.

Semantic feedback, links and prices are checked against all body surfaces where they render. Shell links use their own foreground when header/footer and body palettes differ; this includes hover/focus. Generated semantic-button foregrounds choose pure black or white, with an exhaustive256-gray boundary test proving AA; hover/pressed move away from that foreground.

Gradient validation samples every interval as well as global positions/stops; a regression fixture covers a compressed black-to-white transition whose endpoints alone both pass against gray text.
