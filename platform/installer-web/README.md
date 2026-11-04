# Buat Toko Online Sendiri — seller account and installation workspace

The static UI is served from the dedicated control-plane HTTPS origin. It does not reuse Gheverhan customer accounts, store sessions, merchant PostgreSQL, or a shared commerce database. `/`, `/daftar`, `/masuk`, `/hubungkan-server` and fixed assets are allowlisted by `dashboard.mjs`; arbitrary files remain inaccessible under a same-origin CSP.

## Email OTP account flow

`GET /auth/status` must report `method: email_otp`, `configured: true`, and exact same-origin `/daftar` and `/masuk` capability paths before the real form is shown. Without configured delivery the form remains hidden and explains the blocker. No OIDC provider or password is required by this primary flow.

Registration collects name, email and first store name; returning accounts enter email only. `POST /auth/email/start` returns the UUID challenge, actual TTL and resend interval. The code form accepts six digits with `autocomplete=one-time-code`; resend is delayed by the backend interval. `POST /auth/email/verify` uses the browser's private preauth cookie and exact Origin, then `/api/installer/v1/session` must verify the new HttpOnly session before the wizard opens. There is no second login after verification. No OTP, challenge, bearer or CSRF value goes into a URL or localStorage. Errors expose only fixed user-facing messages. Logout uses the protected CSRF endpoint and clears local identity/UI state; account/profile fields from the previous seller are not retained.

## Eight installation steps

Store information, seller domain proof, fresh VPS preparation, independently verified installer, UUID/fingerprint pairing, authenticated provisioning reports, local admin activation, and local product/photo publication are kept in one workspace. Actions use actual same-origin APIs and CSRF; uncertain create requests preserve their in-memory idempotency key. Responses from an old selection cannot expose another selected installation's instructions.

`GET /installations/:id/install-instructions` is unavailable by default. When a protected release catalog is configured, UUID, control origin, hashes and HTTPS download links must pass validation before commands appear. Commands are assembled from a fixed local template; arbitrary command strings from the response are ignored. Download/checksum metadata from the portal is explicitly not an independent trust channel: verify the CLI, signer and root through the approved separate channel before execution.

The UI consumes `GET /installations/:id/install-progress` as authenticated agent metadata. `LOCAL_READINESS` exposes exact seller-domain links to `/admin/setup`, `/admin/products` and `/`; it does not claim public TLS, product publication, checkout or shipping readiness. The one-time admin code stays on the seller VPS. The portal never asks for SSH, database, carrier, admin passwords or private keys. No fake percentage or synthetic READY status is generated.

## Landing transition

`landing/jetseller/portal-config.json` defaults to `enabled: false`. In an approved release, enabling it permits only the pinned official dashboard origin. The registration/login pages check the public email capability with credentials omitted before redirecting to `/daftar` or `/masuk`. Missing delivery, invalid status, wrong origin or network errors leave an honest unavailable state. This does not modify DNS, TLS, Caddy or a live site; configuration activation belongs to the operational release gate. The versioned landing package must include the config and `assets/js/portal-entry.js`.

## Validation and limits

- `npm ci --ignore-scripts && npm test`: DOM, HTTP, privacy, cross-selection, OTP transition, retry and failure-state contracts.
- `node test/wizard-browser.mjs`: desktop/mobile visual and client contracts with explicitly intercepted synthetic responses. Evidence is tagged `synthetic_browser_contract_only`; it does not prove Resend delivery, PostgreSQL, VPS installation, public TLS or product publication.
- `npm run test:integration`: the existing Ubuntu/dedicated PostgreSQL fixture now exercises email registration, code verification, no-extra-login session, intent/domain/fingerprint pairing, logout revocation, cooldown and returning email login. Delivery uses the actual Resend request adapter remapped only inside a guarded loopback fixture to a local HTTPS mail receiver; OTP is read only in test memory, never printed or screenshot. Browser trust is pinned to that fixture certificate; Node HTTPS uses its explicit CA with certificate verification enabled. With `JETSELLER_PAIRING_E2E=1`, pairing uses the actual built Go CLI in the existing disposable namespace.

These are isolated integration tests, not proof of a live inbox, real external email service, public ACME, a seller VPS or production release readiness. No deployment, database/volume deletion, DNS mutation or production operation is performed by this package.
