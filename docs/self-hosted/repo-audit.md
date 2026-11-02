# M0 — Repository audit JetSeller Self-Hosted

Date: 2026-11-02 WIB. Result: **M0_READY for architecture review**, not implementation/pilot/release approval.

## Provenance and scope

Historical audit snapshot: direct GitHub access confirmed Assyauq26/Gheverhan and PR #136 OPEN at that time. Finalization verified #136 MERGED at 5f6d21ed42c04ef7206e781edae09c728b52850b; only the eight unchanged PRD docs were added since this source baseline. Documentation branch `docs/jetseller-self-hosted-prd-20261102`, exact SHA `6b576b6c35eda343b13352c16b995d3723f49cb7`; audited main `fdf8d18ba90450fa1fe3d9c9392f1fc0eeefd96a`. Fetch completed; README, PRD, ARCHITECTURE, API_CONTRACTS, SECURITY_AND_RELEASES, ACCEPTANCE_TESTS, OPEN_DECISIONS and CODEX_EXECUTION_PROMPT read from Git objects. All eight tracked files enumerated. These replace old SaaS assumptions. Existing local branches/untracked work preserved.

GitHub metadata reports repository visibility **public**. PRD specifies a private master codebase/private release distribution: this is a governance gap, not permission to change repository visibility. No secrets searched/read from live env files. All evidence below is tracked source at the audited SHA, not claims about currently running containers or database contents.

Inventory: 2,624 tracked files; 54 Next route handlers; 19 store SQL migrations; 13 workflows. No tracked `apps/`, `platform/`, or `agent/` at main. The only tracked Go source is `landing/jetseller/tests/release_templates_test.go`, not an installer daemon. Prior unmerged worktrees/PRs are not treated as implemented main architecture.

This is static repository discovery with critical-path source review and cross-tree searches, not a line-by-line certification of every file, penetration test, dependency vulnerability scan or proof of runtime health. No build, database test, Docker startup, SSH/production command, HTTP production smoke, deploy workflow dispatch, migration, DNS or server action was executed in M0. Test definitions are inventoried, not reported as fresh PASS results.

## Existing architecture and reusable assets

| Area | Verified source | Existing behavior / portability implication |
|---|---|---|
| Store frontend/backend | `frontend/package.json`, `frontend/src/app`, `frontend/src/modules` | Next 15.5.28, React 18.3.1, TS5.6.3, npm lockfile; Next API owns commerce. Keep these modules and routes, avoid rewrite. `npm start` starts dev; use Docker production CMD or `npm run serve`. |
| Python backend | `backend/server.py`, `backend/requirements.txt` | FastAPI/httpx thin reverse proxy to localhost Next :3000, not separate commerce backend. Helipod Compose does not include it. Do not package it into the new store without an ingress need; no evidence here of a running proxy. |
| Routes/branding | `landing/jetseller`, `frontend/src/app/admin`, storefront route group | Landing is static and registration page says registration is being prepared. Store `/admin` is the seller dashboard under the new model; do not move it to a central seller dashboard. Static landing is not a functioning installer portal. |
| DB | `frontend/prisma/schema.prisma`, `frontend/prisma/migrations/` | PostgreSQL + Prisma5.22, 19 migrations. Auth, customers, orders, payment, inventory, media references and J&T records share the local store schema. Preserve commerce DB; central registry needs separate schema/client/database with no commerce FKs. |
| Auth | `frontend/src/lib/auth/{jwt,session,session-state}.ts`, `frontend/src/modules/auth/registration-otp.ts` | HS256 session issuer/audience use Gheverhan/Preview identities; session version + revocation checks, local role/permission lookup. OTP uses cryptographic RNG/HMAC and timing-safe compare. Reuse patterns/tests, not signing secrets/accounts across installations or portal. Local admin first-run claim flow is missing. |
| CSRF/origin | `frontend/src/lib/mutation-origin.ts`, `frontend/next.config.js` | APP_ORIGIN validation exists, but fallback uses request origin if absent; server-action allowlist contains legacy hosting origins. Generic self-host profile must validate an explicit canonical origin and remove legacy exceptions only in its own profile. Broad remote image pattern needs SSRF review with custom media/domains. |
| Storage/email | `frontend/src/lib/{storage,storage-local,storage-path}.ts`, `registration-otp-email.ts` | Local filesystem adapter uses private modes, exclusive create and symlink refusal; default provider remains Supabase unless explicitly selected. Resend + sender configuration required; no implicit centrally shared email account. Preserve private payment proof authorization. |
| Container | `frontend/Dockerfile`, `frontend/.dockerignore` | Node22 Debian slim build/runtime, locked npm install, non-root app. Full build tree copied before dev prune; image-size/source leakage and secret exclusion need fixture verification. Base image floats within tag; no standalone output configured. Do not promise reproducibility from a tag alone. |
| Compose/proxy | `deploy/helipod/{compose.yml,Caddyfile}` | PG17 private/no published port, app loopback :3000, Caddy public 80/443, persistent DB/Caddy volumes and media bind. Positive starting point. Fixed app/domain/path/database/user/project assumptions, mandatory Resend env, tag-based images and env-value secrets make it an operator-specific config, not a seller installer template. |
| Runtime privileges | `deploy/helipod/prepare-runtime.py` | Separates owner from runtime, but runtime BYPASSRLS and CRUD across store tables. Review against actual RLS/session assertions before least-privilege changes; blindly removing bypass breaks revocation semantics. Owner DSN construction in deploy process args needs secret-handling redesign for seller helper. |
| Health/maintenance | `frontend/src/app/api/v1/health/route.ts`, `frontend/src/middleware.ts` | Static JSON health, no DB/media readiness. Maintenance preserves health route; HTTP200 alone can accept broken DB/media. Add separate readiness later without changing existing contract. |
| Deploy/rollback | `deploy/helipod/deploy-release.sh` | Exclusive flock, matching app/migration tags and revision labels, Prisma deploy, role grant refresh, preflight then app switch; restore previous app on failed liveness. Does not establish cryptographic trust, explicit image/schema rollback ranges, or fresh DB+media restore proof per update. Existing deployment removes/recreates stateless app for Compose v1 compatibility; no zero-downtime promise. |
| J&T | `official-config.ts`, `official-transport.ts`, `verified-mapping.ts`, `jnt-fulfillment.service.ts`, admin integration route | Local encrypted config and four API adapters already exist, audited dispatch/refund guards and mapping release. Authorization still Super Admin + `JNT_PLATFORM_OWNER_USER_IDS` and SaaS wording. New profile must make this a local store-owner capability, never upload keys centrally. Keep endpoint-specific gates; no real UAT inferred. |
| Webhook | `frontend/src/app/api/v1/webhooks/jnt/route.ts`, `frontend/src/modules/payments/webhook.ts` | Shared acknowledgement placeholder; parses arbitrary JSON, logs caller-controlled event ID and returns success without signature/replay persistence. It is not verified tracking/fulfillment. Disable/reject unsupported webhook processing or implement separately with authenticating contract; never let acknowledgement imply trusted state. |
| CI | `.github/workflows/{test-containment,sprint-2e-isolated-regression,prisma-tls-regression,jetseller-landing-ui}.yml` | Existing unit/security/PG migration/browser suites and static landing tests are reusable regression baselines. Go template tests are not agent tests. `next.config.js` skips lint in build, so explicit lint remains mandatory. |
| Production automation | `.github/workflows/helipod-autodeploy.yml` and manual-production workflows | PR builds do not deploy; main push/path match or manual dispatch can invoke configured SSH deployment. Specific host and deploy secrets are operator assumptions. Do not wire installer work into this workflow; merging future frontend changes may affect live deploy. No signing/GHCR/TUF agent release path found in audited workflows. |

## Gap matrix against PRD and acceptance

| Requirements | Reuse | Gap / next validation |
|---|---|---|
| FR01 / A01,A02,A09,A12 | Local auth/OTP/RBAC patterns | Separate portal/operator identities and installation ownership; no sharing store customer sessions. IDOR/MFA/CSRF negative tests. |
| FR02 / A04–A07 | Local release preflight concepts | Ubuntu24.04 amd64 host inventory, ports/resources/time/egress/conflict checks and non-empty VPS refusal absent. Proposed 4GiB/40GiB **free** is unbenchmarked; old VPS history is not pilot sizing evidence. |
| FR03–04 / A03,A08–A12,A27–A28 | None for device protocol | Signed bootstrap, device pairing, key binding, expiry/replay/rate limiting, rotation/revoke/unpair and server recovery missing. No executable one-liner should be displayed yet. |
| FR05 / A13–A16 | Site-specific Caddy config | Generic domain syntax/IDN/reservations, independent TXT ownership, A/AAAA corroboration, TLS SNI/chain and durable DNS pending absent. No registrar integration needed. |
| FR06–07 / A17–A21 | PG17, volumes, Prisma, non-root container | Installation-scoped templates/secret generation, fixed-operation helper, crash-safe journal and safe resume absent. Secret mounts/CLI leakage and backup gates need design. |
| FR08 / A22–A24 | Local checkout quote/weight/payment modules | One-use local admin setup and explicit installed/readiness separation missing; J&T owner authorization must change only for new self-host profile. |
| FR09,12 / A25–A27 | No central synchronous dependency identified in reviewed checkout entrypoint | Agent, metadata allowlist, console, consent diagnostics absent. Independence requires actual two-hour outage/fault test, not static inference. |
| FR10 / U01–U13,U15–U17 | Lock/preflight/app rollback building blocks | Signed digest/manifest, signer policy, freshness/anti-rollback, registry credential delivery, rollout policy, compatibility, local pause/circuit breaker absent. |
| FR11 / U09,U14 | Existing operational runbooks/manual backup evidence may inform tests | No general per-install encrypted off-server DB+media+config restore workflow demonstrated by M0. Never equate old backup report with current recovery capability. |
| NFR01–09 / C,D | Existing commerce regression coverage | Add protocol fuzzing, helper abuse, control-plane outage, OS/ports/DNS failures, resource measurement, recovery and accessibility matrix on disposable hosts. |

## Architecture recommendation

Keep `frontend/` as store initially. Add new control-plane, agent and shared contract boundaries incrementally; names `apps/*` are proposed, not existing. Each seller VPS runs its own store DB, media, Caddy and local secrets. Central DB holds accounts, installation intents, device public keys, sanitized jobs and release metadata only. Never centralize transaction routing, seller DB pools, customer accounts or J&T keys. `dashboard.jetseller.web.id` is the operator console; seller admin stays on `<seller-domain>/admin`. One signed store artifact serves all independent installations.

Discard old SaaS runtime assumptions in future designs, not existing production records. Historical PR #120 worktree is not the control-plane implementation. No migration of Gheverhan data or secrets is proposed here. See ADR proposals below; all require review, none is a final approved product policy.

## Risk register

| ID | Severity | Evidence / mitigation / review gate |
|---|---|---|
| R01 | Critical | Central signing compromise could affect fleet. Pin authorized signer and roots, anti-freeze/rollback, separate approvals, revoke/freeze drill before pilot. |
| R02 | Critical | Agent with Docker group/socket equals host privilege. Separate unprivileged agent and constrained local helper; adversarial IPC/path/mount/operation tests. |
| R03 | Critical | Wrong schema/app rollback loses service/data. Explicit compatibility plan, backup + separate restore proof, expand-only default and manual recovery for incompatible schema. |
| R04 | High | Existing main push auto-deploy may affect Gheverhan. Separate release workflow and reviewed path/approval boundaries; never dispatch or merge in M0. |
| R05 | High | Old SaaS J&T owner model violates local ownership. New-profile local admin authorization, local encryption key, deny central secrets/PII at schema and transport boundaries. |
| R06 | High | Wrong domain/SSRF/ACME validation causes takeover or internal access. TXT+DNS+verified ingress, restricted network fetch worker, IDN/IP/redirect/AAAA negative tests. |
| R07 | High | Environment/process args and full image copy expose secrets/source. Audit tracked build inputs/.dockerignore, secrets files, redacted errors/argv, inspect image layers without exporting secrets. |
| R08 | High | Static health can approve broken release. Separate DB/media readiness plus read-only app smoke; keep liveness independent. |
| R09 | High | Pairing/rebind race hijacks installation. Device-key PoP, TTL, atomic consume+bind, rate limits, explicit confirmation and reviewed recovery. |
| R10 | High | Public repository conflicts with private-master goal. Product/security decision on source governance and private artifact delivery; do not silently change repository visibility. |
| R11 | Medium | Legacy hostnames, sender defaults and server-action origins break portable stores. Parameterized fresh-install profile with strict validation and preserved Gheverhan profile. |
| R12 | High | Webhook placeholder can be mistaken for verified provider support. Keep unavailable until signature, replay, bounded payload and sanitized logging are proven. |
| R13 | Medium | Provider/registry/center outage incorrectly gates local commerce. Runtime dependency budget: zero central calls in customer/checkout/auth hot paths; chaos test confirms. |

## Staged PR plan and exit gates

1. **PR-00 docs/audit:** merge #136 only through owner/reviewer process; then create docs-only audit branch/PR with this report, ADRs and evidence manifest. No runtime edits. M0 exit is architecture review, not automatic M1 authorization.
2. **PR-01 / M1 portability:** preserve current profile; new parameterized standalone template, validated env, separate liveness/readiness, non-root persistent media, image inventory. Disposable Ubuntu24.04 amd64; A04–A07,A17–A21, commerce regression; benchmark proposed resources. Do not move whole app.
3. **PR-02 registry/portal shell:** independent DB/auth realms, installation intents + domain claim TTL, If-Match/idempotency journal and owner-scoped API contract. A01,A02,A09,A12; no store database credentials centrally.
4. **PR-03 bootstrap/pairing:** reviewed Go CLI/agent, signer trust roots and versioned artifacts, public-key-bound device flow, atomic authorization. A03,A08–A12,A27,A28 and replay/rate/rotation tests.
5. **PR-04 domain/preflight:** non-destructive host inspection, DNS/TXT/TLS pending/retry and collision refusal. A05–A07,A13–A16. No automatic DNS write.
6. **PR-05 install/local setup:** least-privilege DB, local setup secret, durable journal and interrupted install/recovery; A17–A24; DB+media restore drill and checkout readiness.
7. **PR-06 agent metadata/control:** heartbeat allowlist, revoke/unpair, bounded retries, consent diagnostics; A25–A28; no arbitrary remote execution.
8. **PR-07 signed updates after P0:** U01–U17, compatibility, explicit opt-in/window, immutable digests, expiry/revocation, local safety authority and circuit breaker.
9. **PR-08 UX/support** and **PR-09 pilot review:** seven-step real states, accessibility/failure flows and measured clean-host pilot evidence. Separate explicit release approval. Gheverhan migration needs another RFC and is excluded.

## Open decisions / documentation corrections for review

- Unify PRD lifecycle names (`AWAITING_PAIR`, `PREFLIGHT_OK`) with Architecture names (`PAIR_PENDING`, `PREFLIGHT`) before a versioned contract is implemented. Separate observed state from authorized desired action.
- Clarify bootstrap trust-root provisioning/rotation, identity bootstrap before verifier download, offline verification and registry private-pull credential feasibility. No shared owner PAT.
- Resolve mTLS issuance/revocation versus equivalent PoP protocol and privileged helper peer authorization. Defaults are proposals only.
- Domain TLS-before-app/DB ordering needs an explicit ACME/bootstrap route plan; do not claim app readiness from certificate issuance alone.
- Pairing fingerprints/public keys are operational metadata but still sensitive; clarify minimal browser confirmation versus API instruction not to log fingerprints. Never log device_code/private key.
- Agree minimum free-space/RAM from fixture results, backup destination/key recovery/RPO/RTO and application/schema compatibility representation. Licensing cannot introduce a central checkout kill-switch.
- Decide public-master/private-artifact governance, OTP email policy and independent operator identity. Existing store admin is not automatically an operator.

## Verification and handoff

Evidence commands: `git fetch origin main docs/jetseller-self-hosted-prd-20261102`, `git show <SHA>:<path>`, `git ls-tree -r --name-only <SHA>`, scoped `git grep` for release/auth/storage/agent assumptions; GitHub `fetch_pr` and repository metadata. No production access. Static results are reproducible against the pinned commits. No fresh application CI/test/restore/signed-artifact success claimed.

Original evidence was prepared before #136 merged. Finalization on 2026-11-02 verified merge `5f6d21ed42c04ef7206e781edae09c728b52850b` and all eight canonical blobs against the manifest. Only documentation changed since the audited application baseline; no full re-audit was needed. Authorized publication uses sanitized copies in a separate audit PR. Historical findings remain pinned to the audited source. See [review gate](m0-review-gate.md), [visibility impact](visibility-impact.md) and [four-PR M1 plan](m1-pr-plan.md). All ADRs remain PROPOSED; M1 is unauthorized.
