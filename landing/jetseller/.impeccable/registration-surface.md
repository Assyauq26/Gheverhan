# Registration surface — implementation record

Route: `/pendaftaran`. Mode: operate, then read. Build path: code-led, precisely specified extension inside the preserved landing identity. This finish record captures the implemented scope; it does not retroactively claim a pre-build concept round or approved comp.

## Direction contract

**THESIS:** Collect contact and intended-store information in a legible sequence, then make the independent installation path explicit. The endpoint is a saved registration.

**OWN-WORLD:** White page, brand red, Plus Jakarta Sans, dark labels, muted hints, gray field borders and softly rounded cards. Preserve the homepage's existing visual language and composition.

**STORY:** Isi Data → Info Toko → Konfirmasi → Panduan. The seller reviews their information, consents, saves, receives a reference and reads the public guide.

**FIRST VIEWPORT:** Compact wordmark and guide link above a centered introduction. Four connected numbered circles precede a bounded card. Step one contains name, email, optional WhatsApp and a lower-right forward action; on mobile the action expands across the available row.

**SIGNATURE:** Progress circles distinguish current and completed steps. Explicit edit actions return to earlier sections without losing in-memory values. The saved receipt combines a red storefront/check illustration, store name, reference and an honest installation-not-completed statement.

**MOTION:** The current section enters over 200ms with a 5px vertical movement only when reduced motion is not requested. Focus follows the new heading or first invalid field. No new motion is introduced into the preserved landing.

## State and content contract

1. Seller data: required name and email; optional Indonesian WhatsApp number.
2. Store data: required brand and product category; optional domain, city and description; no-domain checkbox clears/disables domain; 500-character description counter.
3. Confirmation: seller/store summaries with edit actions, privacy consent and explicit registration-only explanation. Saving disables controls and announces a busy state. Field/server failures remain recoverable; errors never produce a success receipt.
4. Guide: only a successful `REGISTERED` response with a valid reference reveals this state. Display the store name and reference, explain that the application is not installed, provide the Git Clone command, copy feedback and links to the complete public guide and repository.

The four form steps are distinct from the landing's five instructional cards. The guide is accessible independently of the form. Do not turn either sequence into central authentication, an installation status dashboard, pairing, or an agent flow.

## Finish evidence

Source inspected: `index.html`, `assets/css/main.css`, `assets/css/refactor.css`, `assets/css/registration.css`, `pendaftaran/index.html`, `assets/js/registration.js`, and `kebijakan-privasi/index.html`. HTML and the final stylesheet cascade take precedence over historical comments about older artwork or step counts.

Screenshots are local render evidence in the repository's `.release-evidence/registration-ui/`. Visually inspected: `landing-390.png`, `landing-768.png`, `landing-1440.png`, `data-390.png`, `data-1440.png`, `store-390.png`, `confirmation-768.png`, `success-390.png`, and `success-1440.png`. These cover preserved landing composition at all three requested widths, mobile field spacing/focus and domain disabling, tablet confirmation columns, desktop shell sizing, and mobile/desktop receipt and guide wrapping. Other captured states exist in that directory but are not claimed as individually inspected by this documentation pass.

No external reference image or approved comp was supplied. No numerical visual-fidelity claim is warranted. The screenshots contain synthetic registrations; they do not demonstrate production registration, an installed store or deployment readiness. This pass documents observed styles and behavior from code and images; it does not replace interaction testing, accessibility review or release checks.

## Preservation and boundaries

No existing scoped DESIGN.md or PRODUCT.md was overwritten. The token-bearing DESIGN.md and extension-only design.json capture the established implementation rather than changing it. Landing gradient/neutral/button differences and registration's solid buttons are recorded as route-specific variants, not repaired as drift. No application, test, backend or older installer-web files are changed by this documentation pass.
