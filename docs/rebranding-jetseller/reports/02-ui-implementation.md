# 02 — UI implementation

Status: DONE source implementation; NOT DONE production publication.

Shared JetSeller text wordmark (red Jet, black Seller; StoreLogo uses validated inherited text for custom/non-white header/footer palettes), favicon, Apple icon, 1200×630 OG image. Self-authored SVG text with no scripts or external references; raster exports generated locally. Logo uses existing typed-asset renderer; existing custom identities/images are not replaced.

New/reset draft and first preset use JetSeller Demo Store, #E1251B primary, #B3121A hover, #111418 text, #FFFFFF page, #F7F7F8 surface and #667085 muted. All 53 tokens/schema v1 preserved; disabled surface adjusted to meet existing contrast checker. Exact legacy serialization hash remains eb10463877f5f7e681610f9fdc696ed76395df6f79ed2597823890c86287b405. No-row published/read failure still uses the established legacy fallback: a save must not implicitly publish a new brand. New draft/reset/preset is explicitly published through admin.

Root metadata/OG/Twitter, customer login/register copy, admin desktop/mobile shell/navigation, product/category/shop metadata and fallback brand, footer, OTP/reset email subject/body, hero fallback alt text and Customize preview/reset wording updated. Primary shared buttons and active admin navigation use red. Removed unverified 100K+ customers and absolute transaction-safety claim. Product/brand records and historical media remain untouched.

Legal page branding identifies JetSeller Demo Store; operatorName and contractual/rights references to Gheverhan remain for owner/legal review. Sender/from domains and operational headers unchanged.

Unchanged: JWT/cookies/storage/events/env, Prisma schema/migrations, checkout/pricing/stock, auth/OTP verification, permissions, J&T integration, landing, domain/DNS, Docker/VPS configuration, deployment workflows/secrets/keys.

## Evidence (labels matter)

- Before production: [mobile home](evidence/before-production/390-home.png), [desktop home](evidence/before-production/1440-home.png), [mobile login](evidence/before-production/390-login.png), [desktop login](evidence/before-production/1440-login.png).
- After local Next app: [mobile login](evidence/after-login-390.png), [desktop login](evidence/after-login-1440.png), [register](evidence/after-register-390.png), [legal](evidence/after-syarat-ketentuan-390.png).
- After synthetic component previews: [mobile appearance](evidence/after-appearance-fixture-390.png), [desktop appearance](evidence/after-appearance-fixture-1440.png), [mobile admin shell](evidence/after-admin-fixture-390.png), [desktop admin shell](evidence/after-admin-fixture-1440.png). These render the real components with mocked session/navigation/actions; commerce actions disabled. They are NOT authenticated production or transaction E2E evidence.

Full local browser results: evidence/browser.json (30 route/viewport cases). Baseline and feature use different data environments; no pixel-equivalence claim.
