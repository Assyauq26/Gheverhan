# JetSeller public MVP: seller signup → automatic independent store → catalog-ready

**Scope decision (2026-11-04):** Owner explicitly requires seller signup to result in a usable storefront plus seller dashboard and product/photo upload. A waiting list or a bare installation-intent row **does not meet** the public-release acceptance criterion. Do not publish "toko aktif dalam 10 menit" until this path is measured against a real freshly provisioned seller VPS.

## Fixed product contract

Every seller gets ONE independent installation on their OWN Ubuntu 24.04/amd64 VPS and OWN domain (not a `*.jetseller.web.id` tenant). JetSeller center manages only seller identity, installation ownership, signed release/distribution, device pairing, allowed updates and status. Seller VPS contains the storefront, admin dashboard, PostgreSQL, media, customer records, product content and J&T secrets. Center must not store seller admin passwords, J&T keys, customer/order data or root SSH credentials.

**Seller-visible flow:**
1. Sign up using **verified real email** through a configured OIDC identity provider; sign into the JetSeller portal. Never use the Gheverhan storefront customer registration, demo accounts, or a fake registration form.
2. Enter store name and a verified owned domain. Portal creates a durable, seller-owned **installation intent UUID** with idempotency and domain-reservation checks.
3. Seller prepares their own eligible VPS and domain DNS; the portal provides exactly one version-pinned **cryptographically verified** installer command, not raw `curl | sh`. Seller runs it on their own VPS. This unavoidable seller authorization step is not zero-click remote VPS access.
4. Installer checks OS/resources/Docker/ports/DNS, creates a device key and short pairing code. Seller confirms the device fingerprint in their authenticated portal. All subsequent actions are authenticated and installation-scoped.
5. After matching the **same UUID as the portal intent**, installer validates a signed release manifest + independently pinned trust root, fetches pinned images with short-lived per-installation grants and provisions local PostgreSQL, media, Caddy, HTTPS and app. It applies migrations and verifies readiness; no control-plane direct database access.
6. Seller completes **one-time admin activation on the store's own HTTPS domain**, setting name/email/password locally. No password or activation secret crosses the portal.
7. The admin logs in, creates/publishes at least one real product with price, stock, variant/weight and **uploads a photo**. The product and photo appear on `https://seller-domain/`, and remain after app/DB restarts. The admin can edit the product.
8. The portal reports `CATALOG_READY` only with owner-bound, device-authenticated installer evidence plus local observed readiness. A `PAIRED` device, HTTP200, static landing or installation intent alone must **never** be reported as an active store.

**Launch limitation:** In public MVP, the seller can prepare a live product catalog, but actual checkout/automatic shipping/payment must remain disabled until official carrier quotes/Create Order/tracking/cancellation, payment verification and recovery UAT pass. UI must state this plainly. Do not process or promise customer transactions.

## Verified in source as of RC #164 HEAD 08457936033d31621424376a38dbd21cc9ee13f7

| Component | Present code | Not yet verified for seller-public use |
|---|---|---|
| Seller portal | `platform/installer-web`; create intent, list, pairing and DNS proof | Live OIDC signup/email verification and portal deployment |
| Registry | `platform/installer`, OIDC/PKCE auth, owner-bound installation intent UUID and pairing | Real provider onboarding and end-user E2E |
| Independent store | `deploy/self-hosted` Docker/PG/Caddy/media; local admin setup in CI | Signed release distribution/provisioning on actual seller VPS |
| Seller catalog | `frontend/src/app/admin/products` and editor/media backend | **Fresh self-hosted** seller admin→photo upload→published product browser proof |
| Agent | Short-lived device-bound pairing/renewal CLI | Long-running installer/updater, offline recovery, verified provenance & rollback |
| J&T | Per-store encrypted settings and Tracking compatibility | End-to-end shipping and checkout activation: intentionally blocked |

## Mandatory blockers before promising automatic public onboarding

P0-A. Provision an independent portal/control database and real verified-email OIDC sign-up on isolated HTTPS; connect `/daftar/`, `/masuk/`, portal and ownership with tested redirects. If provider is absent, fail closed and do not advertise signup success.

P0-B. Review **public installer** and signing root distribution, version-lock/Cosign/TUF chain, private registry scoped download credentials, revocation and replay. A disposable test signature or prebuilt local image is not a public installer.

P0-C. Complete the **installation executor after secure pairing**. Current `jetseller-setup pair` deliberately ends at paired; `apply-disposable-fixture` is fixture-only. Do not assume any seller storefront is created by pairing alone.

P0-D. Production-grade per-store identity: the portal installation UUID must be preserved in local installation environment, DB name, agent credential, local admin and device events. This PR introduces that identity **only into the disposable fixture preparation seam**, with synthetic tests. It does not create a live production installer or authenticate the caller. Never accept an untrusted UUID as proof of seller authorization.

P0-E. Real one-time admin, complete product/photo-upload/public catalog E2E on two new seller-owned VPS installation fixtures. Verify distinct JWT/session namespaces, dedicated DB/media, absence of cross-store access, persistent media and recovery after restart. **Current new CI increment:** `deploy/self-hosted/tests/admin-setup.sh` opens the product editor, stages an actual tiny synthetic PNG through the authenticated local-store media API and asserts owner-only access. Staging a photo is NOT equivalent to saving/publishing a product or proving the public storefront displays it.

P0-F. An owner-visible activation status with authenticated agent progress and verified local readiness; no fabricated `INSTALLED`/\`READY\` status. Provide cancellable failure/retry instructions; old installation state must persist. Keep changes reviewable in isolated branches with CI.

## Public release acceptance checklist

- [ ] Two verified seller signups with separate identities complete without demo/test bypass
- [ ] Two distinct domain+VPS installations created from verified bootstrap, each bound to the expected portal UUID
- [ ] Domain ownership proof, public HTTPS chain, isolated DB/media, admin claim and sign-in pass
- [ ] Each seller can create/publish/edit product with photo and observe it publicly on their own storefront
- [ ] Reboot/recreate app retains product data/images; an offline portal does not break the shop
- [ ] Cross-seller identity/DB/media/registration isolation, CSRF, secret redaction, rate limits and signed image policy pass
- [ ] Automatic shipping/payment remain **off** with clear UI explanation; no unverified fees
- [ ] Failed installer/recovery path retains data and does not modify Gheverhan production
- [ ] Release approval and rollback evidence attached with exact tested source/image digests

## Explicit non-goals for launch-critical work

Do not rebuild catalog UI, redesign the landing, implement J&T Create Order prematurely, deploy into Gheverhan production, create platform-owned subdomain tenants, enable insecure direct SSH from the portal, or silently replace the product requirement with a lead/waitlist form. The earlier standalone `platform/public-registration` spike is not an acceptable substitute for automated store provisioning and stays **unreleased**.

**Status today: NOT yet public-auto-installer ready.** This gate is separate from the fact that several isolated CI suites already pass.
