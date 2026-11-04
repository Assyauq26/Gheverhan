# JetSeller independent-store J&T secret provisioning

**Development status:** opt-in runtime fixture behavior. This does not activate seller checkout or carrier Production calls.

## New code behavior

For every independently prepared disposable Self-Hosted store, `deploy/self-hosted/prepare.mjs` now:
1. Sets the complete validated Self-Hosted application profile and its canonical `JETSELLER_INSTALLATION_ID`.
2. Sets `JNT_CONFIG_SCOPE=local_store` **only in the store runtime configuration**.
3. Generates a fresh cryptographically random, base64-encoded 32-byte `JNT_INTEGRATION_ENCRYPTION_KEY` per installation.
4. Keeps that key out of migration configuration, public `.env`, Docker Compose service environment literals, portal accounts and source control.
5. Leaves all carrier customer codes/keys empty until the seller enters official credentials in the store's local admin UI.
6. Preserves the existing fail-closed JNT-SH-02 readiness gate: encrypted settings and Check Fee safe probe are **not** permission to place real shipments or open checkout.

`deploy/self-hosted/launch.mjs` allows J&T local settings and key only in the runtime private config; the migration job rejects those fields. Existing installs without J&T fields remain startup-compatible. When either field is present, both a local_store scope and a canonical 32-byte Base64 key are mandatory; malformed or partial settings are refused. The key is not logged. The existing migration-only DB identity remains separated from the app runtime role.

## Evidence

`node --test deploy/self-hosted/tests/packaging.test.mjs` checks two independent fixture installations receive different keys, checks key length and base64, confirms no migration/public-env leakage, and rejects invalid/missing scope/key. Full RC combined CI is required to verify the change alongside the actual PostgreSQL, Docker, browser and installer flows.

## Not yet proven

- `frontend/src/infrastructure/shipping/jnt/seller-config.ts` still permits absent `JETSELLER_STORE_PROFILE` when JNT_CONFIG_SCOPE=local_store if invoked outside the actual launcher. This is an **independent release blocker**: require strict canonical profile for all J&T management paths and upgrade isolated browser tests to an HTTPS-based complete Self-Hosted fixture without test-only bypass.
- Carrier owner agreement, district/origin mapping, production Check Fee UAT, Create Order, AWB tracking, cancellation, payment and checkout readiness remain blocked.
- Operator-approved encryption key rotation/recovery/backup flow has not been demonstrated on a production-profile seller VPS. Losing the key would make existing J&T encrypted configuration unreadable.
- Installer remains a signed disposable fixture, not an approved publicly distributed seller installer.

Never modify Gheverhan production. Do not migrate live legacy J&T ciphertext into the new local mode implicitly.
