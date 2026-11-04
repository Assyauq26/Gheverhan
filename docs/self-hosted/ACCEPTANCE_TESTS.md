> Identitas produk diperbarui 4 November 2026. Identifier teknis lama tetap kompatibel; lihat `../rebranding-buattokosendiri/README.md`. Klaim kesiapan dalam spesifikasi ini tetap memerlukan bukti implementasi.

# Acceptance Criteria & QA Matrix

The following is a **test plan**, not evidence of completed testing. Every test must be scripted/recorded against a disposable VPS and a sandbox control plane before production pilot.

## Definition of Done (global)

- Every PR has tests, code review, docs, positive and negative cases, security impact, rollback/feature flag, and no production mutation.
- No published customer PII, SSH password, DB DSN/secret, payment or J&T credential in central database, payload, logs, container image, or browser storage.
- No shared runtime/database for seller stores. Every installation is independently recoverable.
- All critical UI frames tested desktop 1440/1280, mobile 390/360, validation and keyboard behavior.
- Existing Gheverhan frontend, backend, auth/OTP, commerce, shipping gates, storefront, and deployment behavior not regressed.
- Installation idempotency and update rollback are demonstrated with evidence; no shell execution from control plane allowed.

## A. Core P0 scenarios

| ID | Test | Required result |
|---|---|---|
| A01 | Account new seller verified OTP and portal login | Session scoped to seller; redirect to installer |
| A02 | Seller A fetches installation ID of Seller B | 404/403 without disclosure |
| A03 | One-click command copied on desktop/mobile | Correct version-pinned verifiable command, no secret embedded |
| A04 | Bootstrap on clean Ubuntu 24.04 amd64 | Preflight succeeds; agent starts; no existing packages destroyed |
| A05 | Bootstrap on unsupported distro/arch | Block with remediation; no partial destructive install |
| A06 | Bootstrap on occupied ports 80/443 | Detect conflict, explain; unrelated service untouched |
| A07 | Bootstrap run twice concurrently | Single installation, single DB volume; safe lock |
| A08 | Agent creates device code | User code visible, secret device code never logged |
| A09 | Pair before email verification or user confirmation | Denied |
| A10 | Pair with expired/used/brute-forced code | Denied/rate limited, no binding |
| A11 | Two simultaneous approvals for same pairing | Exactly one binding, atomic transaction |
| A12 | Pair from second unauthorized seller | Denied |
| A13 | Domain TXT control proof missing | Cannot mark domain owned |
| A14 | Correct TXT but wrong A/AAAA | Remains DNS pending, actionable error |
| A15 | Ports 80 or 443 blocked | SSL pending/failed, not marked live |
| A16 | Correct DNS/TLS after fix | Resume same job, cert valid |
| A17 | Provision local PostgreSQL | DB private network, persistence, least-privileged role, not exposed on host |
| A18 | Kill DB container and restart | Data retained, health recovers |
| A19 | Interrupt installer process / power loss during DB/app install | Safe resume, no volume deletion/duplicate admin |
| A20 | App built from signed digest | Image verified; app responds through Caddy HTTPS |
| A21 | Bad artifact signature/digest | Fail closed before running artifact |
| A22 | First-run local admin setup | Password/local secrets only on seller VPS; central does not receive |
| A23 | Seller storefront without checkout settings | Store installed but checkout guarded, no false ready-to-sell claim |
| A24 | Complete local merchant config with simulated J&T | Readiness gates reflect verified state, no fake official tariff |
| A25 | Central Portal unreachable for 2 hours | Storefront and local checkout/auth still functional |
| A26 | Agent heartbeat | Only allowlisted non-PII technical metadata sent |
| A27 | Agent revoked/unpaired | No update access, store/DB continue operating |
| A28 | Reinstall on server with existing Buat Toko Online Sendiri | Repair/resume route, no DB reset |

## B. Update and recovery scenarios

| ID | Test | Required result |
|---|---|---|
| U01 | CI build release v1.0.1 | Signed immutable digest, SBOM/provenance, approved release metadata |
| U02 | Wrong signer certificate valid but unauthorized | Rejected (pin specific signer identity) |
| U03 | Tampered image or manifest | Rejected |
| U04 | Expired/rollback/frozen metadata | Rejected unless explicit signed rollback process |
| U05 | Incompatible agent/DB schema/OS | Mark blocked; no image deployment |
| U06 | Pilot ring update | Demo first, manual approval to expand, telemetry accurate |
| U07 | Update policy notify-only | No automatic deployment |
| U08 | Update paused/time window closed | No deployment; status queued |
| U09 | Server low disk or backup unreachable | Block before changing running image or schema |
| U10 | Network loss mid-download | Old app stays active, retry safely |
| U11 | App health fails after deployment | Roll back image where schema compatible; incident reported |
| U12 | Breaking migration incompatible with old image | Abort before update or require manual recovery; never blind rollback |
| U13 | Update interrupted and resumed | Exactly one completed operation, no dual deployments |
| U14 | Backup taken and successful restore test | DB data and uploaded media recovered in disposable restore environment |
| U15 | Rediscovery after agent credential rotation | Continues with new identity, old revoked credentials rejected |
| U16 | Compromised release sign key exercise | Freeze channel and reject revoked signer |
| U17 | 3 failed updates on one node | Circuit-breaker: manual intervention instead of loop |

## C. UX and operational tests

- 7-step desktop/mobile wizard; multi-step progress survives reload, phone keyboard, and back/forward navigation.
- Error screens for DNS mismatch, SSL pending, disk full, auth denied, pairing expired, duplicate install, signed image failure and network offline.
- Operator dashboard groups by version, channel, install status, health, overdue heartbeat; never uses raw customer data.
- Accessible labels, focus indicators, 44px tap areas, correct semantic state, high-contrast loading/disabled display.
- Explicit wording: “Aplikasi Terpasang” vs “Toko Siap Berjualan”; show activation prerequisites and license/offline implications plainly.
- Log export strip secrets/user identifiers and ask seller approval; events traceable via correlation ID.

## D. Regression and failure injection

- Current storefront home, PDP, variations, cart, voucher/flash sale, checkout, OTP, login, admin product editor; keep existing behavior and test coverage.
- Inject 429/500/timeout from control plane; install status correct and store independent.
- Simulate Docker daemon failure, PostgreSQL disk full, Caddy renewal failure, DNS TTL delay, clock skew, agent crash, slow network, no registry, corrupted image, expired credential.
- Demonstrate data persistence across `docker compose up --detach`, container recreate, Caddy restart, app rollback, agent unpair.
- External service real orders are **never** created in automated tests; only sandbox/mocks and local synthetic data.

## E. Required evidence per milestone

- Link PR/commit + diff summary + CI pass matrix, with failures disclosed.
- Screenshots for every wizard step desktop and mobile (PII redacted).
- Preflight/install log sample (redacted), one pairing state transition diagram, one safe failure/resume trace.
- Docker inspected ports + named volumes, HTTPS cert verification, PostgreSQL backup & restore proof.
- Signed-release verification output and tamper rejection, before/after app versions and rollback report.
- Runbook: install, repair, recover, revoke, pause rollout, rotate signing keys, offboarding.
- Explicit release recommendation: `READY_FOR_PILOT` or `BLOCKED` with reasons; never assume production approval.