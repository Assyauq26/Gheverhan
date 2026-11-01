# Premium motion audit and verification

Baseline main c5cc01e. JetSeller is static HTML/CSS/vanilla JS served independently by Caddy; it is not a Next.js route. No React/Motion/GSAP dependency is appropriate for this small static implementation. Existing CSS animation and IntersectionObserver are reused. No hostname routing, backend, storefront, Caddy or deployment configuration changed.

Audit: V2 already provides text branding, native details, real CTA destinations and reduced motion. Its hero has a single group entrance, timeline is static, and closing CTA is dark. This revision restores the requested profit headline, adds separate line/device/CTA motion, a local parcel illustration, staggered cards, viewport-driven timeline progress, touch feedback, and a red closing CTA. Core text is present in initial HTML; line motion uses transform without hiding the LCP heading. CSS remains scoped to this static landing bundle.

## Higgsfield assets

Connected catalog inspected. Proposed Asset A: Seedance 1.5 Pro, one 8-second silent video, 720p, 16:9. Tool cost quote: **9.6 credits**. No generation submitted and no paid credits used. User approval required by the supplied brief before generation.

A prompt: Premium e-commerce logistics visual. Minimalist white studio, elegant red parcels, subtle delivery flow, realistic soft shadows, cinematic product lighting, smooth restrained camera drift. Near-seamless loop. No text, no logo, no watermark.

B brief: A clean white miniature storefront assembling in three restrained stages, red panels, neutral studio lighting, static camera, no text or logos. Keep UI text in real HTML. Not quoted or generated.

C brief: One red shipping parcel with neutral tape and soft studio shadow on white, understated logistics product photography, no text/logo/watermark. Current fallback is local CSS parcel artwork; no generated asset claimed.

After asset approval: verify output, optimize local MP4/WebM and static poster, reserve aspect ratio, use muted playsinline, suppress video requests/playback for reduced motion, and retain static fallback on failure. No empty video element or external SDK was added while media is unavailable.

## QA scope

Browser regression runs at 360/390/428/768/1024/1440/1920: overflow, logo, mobile menu, Escape, FAQ, CTA navigation, demo link, reduced motion and page exceptions. Screenshots motion-{width}.png are current local results; motion-before-{390,1440}.png are fresh public baseline captures. Local server returns 200 for homepage/registration/login and 404 for unknown URLs. Production was read only.

JS syntax and whitespace checks run. Static HTML has no app build/typecheck pipeline. Previous V2 Lighthouse scores are NOT measurements for this revision. INP, Android frame rate, LCP/CLS budgets and media transfer remain to be measured for final asset integration. Generated video quality and seamlessness remain unverified pending approval. No release or merge authorized.
