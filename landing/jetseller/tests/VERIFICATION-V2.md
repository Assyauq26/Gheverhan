# JetSeller V2 verification

Baseline: origin/main f22267d (standalone landing #121). Scope is exclusively landing/jetseller; deployment files and server configuration unchanged.

## Audit and implementation

Old branding combined a complex overlapping mark with an inverted wordmark color and a small subtitle. Header, footer and information-page brands now use HTML text: Jet #E1251B, Seller #111418. Feature and step icons use a consistent 24-unit outlined system. Existing native FAQ, destination links and honest registration/login availability copy remain.

The old hero packed three dashboard columns into a small screen and placed a decorative truck above it. The new composition uses two dashboard columns, a subdued shipping notice, a light storefront phone and sufficient vertical clearance. Mobile navigation formerly placed authentication actions at a fixed 178px offset; it now uses one disclosure in normal flow, with Escape, link dismissal and breakpoint reset. Without JS the navigation remains available.

Motion uses transform/opacity entrance, IntersectionObserver reveals and a 5px floating notice. Content is never hidden awaiting JavaScript. Reduced motion disables animations/transitions. Native details/summary remains keyboard operable.

## Executed QA

Chromium browser.cjs: PASS at 1440, 1280, 1024, 768, 428, 390 and 360. Checks include page overflow, text logo, demo destination/new-tab attributes, mobile open/Escape/link dismissal, FAQ expansion, CTA navigation to registration, console exceptions and reduced motion. Local routes /, /daftar/, /masuk/ return 200; unknown route returns 404 on the local static test server. Production Caddy was not changed or re-deployed, so these are local routing checks.

Run with an available Playwright install:

```
python -m http.server 8765 --directory landing/jetseller
PLAYWRIGHT_MODULE=/path/to/playwright node landing/jetseller/tests/browser.cjs
```

Lighthouse local mobile audit: Performance 99, Accessibility 96, Best Practices 100, SEO 100. The report retains a contrast warning; these lab results do not establish Production performance. No fake scores or disabled audits. JS syntax and git diff whitespace checks pass.

Before images in evidence/before are the baseline's existing recorded captures, not new captures against Production. After images v2-{width}.png are current local browser captures. No additional reference screenshots were supplied with this brief.

No backend, Gheverhan frontend, database, J&T integration, Caddy, Compose, DNS or workflows were changed. No merge or Production deployment performed.
