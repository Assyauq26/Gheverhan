# PRD — JetSeller Self-Hosted Installer & Central Software Management

| Field | Value |
|---|---|
| Document | Product Requirements Document |
| Product | JetSeller Self-Hosted Commerce |
| Version | 1.0, 2 November 2026 |
| Status | Proposed for technical discovery and staged implementation |
| Priority | P0/MVP installation & update safety |
| Language | UI Bahasa Indonesia; technical/API naming English |
| Audience | Product owner, Codex, architects, security reviewers, QA |

> **PENTING:** Dokumen ini adalah rencana, bukan pernyataan bahwa fitur sudah tersedia. Jangan jalankan perubahan produksi, migrasi Gheverhan, atau deployment tanpa release gate dan persetujuan eksplisit. Jangan menganggap API J&T Production siap digunakan.

## 1. Executive summary

JetSeller beralih dari model SaaS runtime multi-tenant yang ditangani pusat menjadi **distribusi aplikasi toko online self-hosted**. Setiap seller membeli hosting VPS Linux dan domain sendiri. JetSeller memasok aplikasi toko online lengkap (storefront, dashboard seller, backend), installer berbasis web dengan satu bootstrap command di VPS, registry instalasi, lisensi software (jika digunakan), pembaruan rilis terverifikasi secara terpusat, audit deployment, dan monitoring non-PII.

Model ini memastikan seluruh toko menggunakan **satu sumber kode** tanpa berbagi database atau runtime. JetSeller tidak menjadi penyedia hosting, registrar domain, pemroses data transaksi lintas seller, ataupun pemegang kata sandi SSH dan database seller.

## 2. Problem statement & pengguna

**Masalah seller**: ingin toko online sendiri pada infrastruktur miliknya, tetapi kesulitan memasang Next.js, PostgreSQL, reverse proxy, DNS, SSL dan pembaruan tanpa keterampilan DevOps.

**Masalah JetSeller**: ingin memperbaiki bug, meningkatkan fitur, dan menjaga keamanan ratusan instalasi tanpa harus SSH ke setiap VPS atau mendistribusikan source repository privat.

**Persona**:

1. **Seller Owner**: membeli VPS/domain, mengikuti wizard, mengaktifkan toko, menyetujui kebijakan update; mengelola transaksi di dashboard tokonya.
2. **Seller Technician** (opsional): diberi izin untuk menjalankan bootstrap pada VPS dan memeriksa DNS; tidak harus mengetahui akun/secret JetSeller pusat.
3. **JetSeller Platform Owner / Release Manager**: mengatur master rilis, staged rollout, kebijakan keharusan versi minimum keamanan, support dan incident.
4. **JetSeller Support Operator**: melihat metadata instalasi dan log tersanitasi sesuai hak akses; tidak memiliki akses default ke data pesanan/customer atau shell VPS.
5. **End Customer**: mengakses storefront publik dan melakukan belanja; **tidak bergantung pada availability control plane**.

## 3. Keputusan bisnis dan batas sistem (source of truth)

| Area | Keputusan wajib |
|---|---|
| Hosting | Seller membawa VPS sendiri; MVP Ubuntu Server 24.04 LTS, x86_64 (amd64) dengan akses sudo yang sah |
| Domain | Seller membeli sendiri domain; DNS diatur melalui dashboard registrar/DNS provider seller |
| Store runtime | Satu set container independen di tiap VPS: app Next.js, PostgreSQL, Caddy; agent update terpisah |
| Source | Satu private master repo JetSeller, CI/CD menghasilkan signed immutable artifact |
| Installs | Bootstrap satu command dari portal resmi; pairing device-style; **tanpa menitipkan password SSH** |
| Database | PostgreSQL setiap toko sepenuhnya lokal; tidak disinkronkan ke pusat |
| Seller URL | `https://domain-seller/` dan `https://domain-seller/admin` |
| JetSeller Portal | `https://jetseller.web.id` (akun, wizard, instalasi, status perangkat) |
| JetSeller Admin | `https://dashboard.jetseller.web.id` (operator platform) |
| J&T | Credentials seller masing-masing, diisi di toko setelah instalasi; bukan API key pusat |
| Update | Agent outbound-only memeriksa signed manifest, immutable image digest, rollout policy, preflight, backup, deploy, health, rollback |
| Outage pusat | Tidak menghambat storefront, checkout lokal, dan transaksi yang tidak membutuhkan control plane |
| Ownership data | Produk, akun toko, pembeli, pesanan, pembayaran, media, konfigurasi J&T tetap di server seller |
| Demo Gheverhan | Jangan reset, migrasi, atau ubah deployment production sebagai bagian P0 |

**Tidak ada biaya hosting atau domain yang ditagih JetSeller secara otomatis** dalam desain ini. Skema lisensi/software support adalah keputusan bisnis terpisah, tidak boleh menjadi kill-switch checkout saat portal offline.

## 4. Goals, non-goals, dan metrik

### 4.1 Goals

- G1: seller dapat menginstal aplikasi pada VPS bersih lewat satu perintah bootstrap + wizard web tanpa menyalin source code.
- G2: pairing VPS ↔ akun seller aman dengan consent dan masa berlaku, tidak mengumpulkan kredensial SSH.
- G3: PostgreSQL, Caddy/HTTPS, storefront, dashboard, dan local admin setup terbentuk secara konsisten/idempotent.
- G4: aplikasi tetap berfungsi saat portal dan update service pusat tidak tersedia.
- G5: penerbitan satu versi source code dapat di-rollout ke seluruh instalasi yang kompatibel berdasarkan kebijakan, tanpa eksekusi shell remote arbitrer.
- G6: operasi install/update memiliki progress, sanitized audit, retry, backup/restore teruji, dan rollback.
- G7: status instalasi, versi, heartbeat, domain, update outcome bisa dikelola lewat control plane tanpa mengambil PII toko.

### 4.2 Non-goals MVP

- Shared hosting/cPanel atau Windows server; multi-VPS cluster; Kubernetes; managed VPS dan domain marketplace.
- Control plane yang memproses pesanan toko, sinkronisasi semua customer/order ke pusat, live database admin lintas toko.
- Universal SSH automation dari browser atau fitur terminal/remote command root dari pusat.
- Integrasi semua registrar/domain providers; otomatisasi pembayaran lisensi atau provisioning hosting.
- Migrasi otomatis produksi `gheverhan.store` ke model baru.
- Multi-vendor marketplace, multi-store per satu instalasi, instalasi tanpa akses terminal sama sekali.
- Koneksi kredensial J&T global atau klaim semua layanan J&T telah UAT production.

### 4.3 Metrik target (proposal untuk pilot, bukan janji marketing)

- >=95% instalasi di VPS fixture yang memenuhi syarat selesai tanpa bantuan manual (dari tes terkontrol).
- >=99% pairing sukses di simulator jaringan sehat; pairing yang gagal dapat diulang tanpa instalasi duplikat.
- 0 password SSH, database, API key shipping, atau PII customer tersimpan di JetSeller pusat/log.
- 100% release yang diinstal lulus signature dan digest verification.
- 100% deployment update memiliki jejak audit, alasan dan status rollback.
- Toko tetap memberikan respons normal saat control plane unavailable (chaos test).
- 100% backup test dipulihkan setidaknya sekali sebelum update database berisiko tinggi di pilot.

## 5. Fase delivery dan prioritas

- **P0 Foundation:** repository audit, dockerized standalone store, test matrix, local bootstrap verification, device pairing, installation registry, domain setup manual via DNS, local PostgreSQL, installer progress, store admin, agent heartbeat, signed release plumbing, backup+restore test.
- **P1 Reliable Updates:** rollout channels canary/stable, artifact signing enforcement, staged rollout, rollback of app, schema compatibility gates, audit/alerts, revoke/unpair/rebind, support UI.
- **P2 Expansion:** multi-distro verified, ARM64, advanced observability, optional managed backup integration, custom update windows, customer-specific patches if policy permits, analytics opt-in.

Do not attempt P1/P2 before P0 acceptance and security review.

## 6. Seller experience & screens (desktop 1440 and mobile 390/360)

**Public page:** CTA “Instal JetSeller di VPS Saya”, eligibility and prerequisite checklist. Site does not claim all hosts supported.

**Auth:** seller name, email, phone optional/required per existing account policy review, password + confirmation, OTP verification, privacy/terms consent; respect existing secure auth patterns (do not rewrite auth blindly).

**Installation workspace:** installation list, name, domain, status, version, last check-in, actions: `Lanjutkan Instalasi`, `Lihat Log`, `Ganti Domain`, `Tunda Update`, `Bantuan`, `Hapus Registrasi` (only after safe unbind; never delete data on seller VPS by accident).

**Wizard (7 functional steps)**:

1. **Persiapan:** confirm purchased VPS & domain; distro/cpu/RAM/disk/ports; explain support and risks, ownership; choose existing vs new blank VPS; existing VPS needs non-destructive conflict preflight.
2. **Profil Toko:** store display name, primary domain, local admin email, no password stored in portal; validate duplicate domain reservation.
3. **Hubungkan VPS:** portal generates short-lived installation session; shows version-pinned, digest-verifiable bootstrap command; seller runs in VPS terminal; terminal shows short pairing code and verification URL; portal confirms account/installation/name and binds one server.
4. **Pemeriksaan Server:** OS, architecture, sudo, RAM/disk, occupied ports, Docker version, time sync, DNS readiness, outbound HTTPS, old Docker apps/volumes; report warnings/errors, never silently override.
5. **Domain & HTTPS:** display DNS A/AAAA examples based on verified server public IP; optional `www` alias; independent TXT ownership verification; DNS check; Caddy certificate issuance when reachable; allow `DNS_PENDING` without losing installation state.
6. **Database & Install:** choose `New Local PostgreSQL` (only MVP option); generate secret locally, persistent volume, migration, local admin bootstrap, seeded safe defaults, image verification; show progress and retriable phases; setup admin password via HTTPS on local store post-provisioning, never send it to central portal.
7. **Update Agent & Handoff:** show installation ID, version, channel, last heartbeat, update preferences; verify signed-manifest path; show `Store Installed` versus `Store Ready to Sell` status; CTA `Buka Dashboard` and `Buka Website` after checks.

**UX requirements:** Progress persists across browser refresh/session; all steps mobile-responsive (keyboard, validation, sticky actions, no cramped tables); statuses visible in Bahasa Indonesia; explicit next action for each error; empty/loading/success/error, retry, offline; no overly optimistic “10 menit” guarantee.

### 6.1 State model

`DRAFT → ACCOUNT_VERIFIED → AWAITING_PAIR → PAIRED → PREFLIGHT_OK → DOMAIN_PENDING → TLS_READY → DB_READY → APP_INSTALLED → AGENT_REGISTERED → INSTALLED → STORE_SETUP_REQUIRED → STORE_READY_TO_SELL`.

Failures: `PAIR_EXPIRED`, `PREFLIGHT_BLOCKED`, `DNS_MISMATCH`, `TLS_FAILED`, `DB_INIT_FAILED`, `MIGRATION_FAILED`, `APP_HEALTH_FAILED`, `AGENT_OFFLINE`, `MANUAL_INTERVENTION_REQUIRED`, `CANCELLED`.

States must support resumability/retries with idempotency. **`INSTALLED` != `STORE_READY_TO_SELL`**.

## 7. Functional requirements with IDs

### FR-01 Accounts & authorization

- Seller must authenticate and confirm email before creating installation sessions.
- RBAC: seller owner may create, pair, update and unpair own installations; invited seller technician needs explicit scoped delegation; operator sees only metadata, not credentials/PII.
- All state changes authorized server side with tenant/account ID derived from session, not request-controlled.
- MFA recommended for installer and control-plane privileged actions; sessions revocable.

### FR-02 Prerequisites & compatibility

- Initial target Ubuntu 24.04 LTS amd64. Minimum requirements are configurable **proposal**: 2 vCPU, 4 GiB RAM, 40 GiB free disk at install (or stricter/looser after measured tests); SSH/sudo, IPv4, outbound HTTPS 443, inbound 80/443 for public domain, correct time.
- Preflight checks Docker/Compose available or installable, open port conflicts, package manager lock, IPv6 if AAAA exists, disk filesystem, swap, DNS resolution; blocking errors cannot be bypassed silently.
- Installer detects existing apps and never replaces Caddy/Docker configs or containers unrelated to JetSeller. Conflict requires explicit guided remediation or stop.

### FR-03 Secure one-command bootstrap

- Portal presents one **copyable line** that downloads a **version-pinned bootstrap artifact** and verifies SHA-256 plus a signature against pinned trust roots **before execution**. No unsafe unverified `curl | sh` pattern.
- The bootstrap line embeds no long-lived token/password. Pairing is device-style, entered/approved in authenticated portal; short TTL and rate limited.
- Script minimally installs/verifies agent and starts outbound HTTPS pairing; no remote SSH ingestion or root login from central.
- Logs redact transient codes/keys, and are stored locally with rotation and restricted permissions.

### FR-04 Pairing / unpairing

- Agent requests device pairing code (`device_code` secret held locally; `user_code` short for browser). Seller approves in portal while signed in.
- Pair only after displaying hostname fingerprint, server architecture, requested scopes, installation name and domain. Block duplicate binding and unauthorized transfer.
- Following approval, agent receives scoped short-lived identity credentials; use mutual TLS or equivalent proof-of-possession, rotate automatically; revoke immediately in center.
- Pairing attempt may expire, cancel, or be retried; reuse of code rejected.
- Unpair does **not** delete local app/data. Agent moves to `UNPAIRED` and stops updates, while store remains operational.

### FR-05 Domain & TLS

- Domain must be verified as controlled by seller via DNS TXT or equivalent independent challenge; simply pointing A record at IP is not proof of ownership.
- Agent derives publicly reachable IP with corroboration, displays DNS A/AAAA/CNAME guidance; no ownership assumption and no automatic registrar modification.
- DNS A/AAAA must point to the intended VPS; warn about stale AAAA; allow propagation lag and check from multiple resolvers/authoritative DNS where feasible.
- Caddy config for selected domain with automatic HTTPS; do not claim SSL ready until certificate and HTTPS response are verified. Preserve Caddy `/data` and `/config` volumes.
- `www` alias/canonical redirect optional; changes require safely validating new domain before deactivating old.

### FR-06 PostgreSQL & local data

- Installer creates an isolated PostgreSQL container + durable volume, unique least-privileged app role, randomly generated credentials and DB, with no public PostgreSQL port.
- Pin PostgreSQL major version compatible with existing schema, verify plugin/extensions; upgrades of PostgreSQL major excluded from routine app update.
- Run migrations only through explicit version-compatibility gate; operations idempotent and guarded by locking; destructive migrations require backup+approval.
- Secrets never exposed in portal, agent heartbeats, application logs, browser or Docker image layers. Avoid leaking via process arguments, command line or world-readable `.env`.
- Installer creates storage volumes, detects quota and checks restoring from backup. Tenant owns its database and data.

### FR-07 Install orchestration

- Agent executes declarative, signed installation manifest allowlisting desired services/versions; no arbitrary shell commands from control plane.
- Compose services: `app`, `db`, `caddy`; agent and minimal privileged updater as host services or isolated runtime. App binds only loopback/internal network; Caddy alone on 80/443; PostgreSQL internal only.
- Steps: preflight → validate DNS → download signed images → create secrets/volumes → start db → DB health → migrations → app start → Caddy config/TLS → health smoke → agent registration → installation report.
- Must resume after network/SSH terminal interruption or power failure; individual steps idempotent and traceable.
- No seed of real customer data. Default setup only; seller configures payment/shipping/warehouse/actual product weights post install.

### FR-08 Application onboarding & readiness

- Admin owner must set credentials on store's **own HTTPS endpoint**; no centralized access or password collection. Generate limited-use local setup credential with short TTL and no sensitive value in logs.
- First-run checklist: identity/branding, at least one product, stock/real weight, warehouse, payment, J&T credential + API tests, verified shipping rates, domain/HTTPS, legal/privacy config. Gate checkout independently of store installation.
- J&T shipping uses **seller-provided** official J&T credentials stored locally; test in Sandbox and do not enable Production until seller passes explicit endpoint-specific readiness/UAT.

### FR-09 Agent & operational control

- Agent outbound HTTPS heartbeat; example interval 5 minutes ± jitter, with exponential backoff, rate limits, offline tolerance.
- Heartbeat allowlist: installation ID, app version/digest, agent version, OS/arch, resource aggregate, service health flags, certificate validity, last backup/restore check metadata, update state and sanitized error codes. **No customer PII, order data, SSH keys, J&T keys or database URLs.**
- Agent provides diagnostics capture with local review and consent before sharing. Operator cannot run arbitrary shell.
- Agent authentication rotated, revoked or disabled without breaking storefront; portal shows last contact and cannot call a stale offline machine 'healthy'.

### FR-10 Central release management & auto-update

- Only signed releases with immutable image digest, compatible agent/OS/schema range, explicit release channel (`canary`, `stable`) and rollout manifest are eligible.
- Seller chooses update policy (MVP: `notify_only`, `automatic_with_window`; `critical_security` with owner approval/clear contract). Default for pilots **notify_only**; auto-update opt-in.
- Agent retrieves signed release metadata, verifies allowed signer identity, digest, monotonic version and expiry; respects local pause/maintenance and lock; no downgrade unless explicit signed rollback authorization.
- Update plan: check disk/resources → verify backup/restore readiness → acquire exclusive lock → pull verified image → run DB migration gate → deploy staged → health and smoke → finalize → report; failure triggers safe app rollback and `MANUAL_INTERVENTION_REQUIRED` if DB schema cannot rollback.
- Rollout rings: demo disposable → 1 internal pilot → 5 pilot sellers → 10% → 25% → 100%, with gates based on measured outcomes and explicit approval; do not use live Gheverhan as the first canary without separate consent.

### FR-11 Backup, recovery & disaster handling

- Initial backup policy is explicit and configurable locally; installer recommends off-server encrypted backups and validates repository access; only a backup stored on the same VPS is insufficient for server loss.
- DB dump/PITR method chosen by data size and RPO/RTO; base backup + WAL optional later, documented retention and restore tests mandatory for production-grade deployments.
- Restore is opt-in, requires seller authorization, dry-run/sandbox when possible, and clear warnings. Never execute a destructive database restore from central portal automatically.
- Restore test must verify both DB and associated media/storage; record last successful restore test separately from last backup.
- No `docker compose down -v`, drop database, or delete volumes in installation/update rollback paths.

### FR-12 Central console

- Seller Portal: own installation list/detail, pairing state, prerequisites, DNS steps, update channel/window, support diagnostics, recent update history, unpair and reinstall guidance.
- Super Admin dashboard: installation registry, version adoption, agent health, failed jobs, rollout, release approvals, operator audit, without default seller data visibility.
- Updates can be paused globally and revoked using signed metadata. Disabling center must not disable commerce runtime.

## 8. Trust boundaries & data privacy

**Central** may know account identity, installation ID, claimed domain, software version, host technical metadata, agent public key/fingerprint, status and audit. **Local** holds orders, customer identities, payment/shipping secrets, product content, DB password, app signing secrets and media.

All central→agent actions must be declarative, authenticated, scoped, signed, replay-protected, idempotent and auditable. Never expose generic Docker socket/SSH/exec over a public API. Root privileges, if unavoidable for initial bootstrapping, are delegated to tightly restricted local installer helper only.

## 9. Non-functional requirements

- NFR-01 Isolation: no DB, storage, network or session shared among separate stores.
- NFR-02 Availability: store runs independently from JetSeller center; agent offline cannot block checkout.
- NFR-03 Security: TLS, secret masking, role-based permission, mTLS or proof-of-possession, signed immutable artifacts, least privilege and audit.
- NFR-04 Reliability: resumable provisioning, idempotent retries, durable step journal, timeout/reconciliation, interruption recovery.
- NFR-05 Operability: structured logs, correlation IDs, safe support export, separate debug and operational logging, no plaintext secrets.
- NFR-06 UX: desktop/mobile responsive, local language, accessibility WCAG AA principles, >=44px tap target, labels, validation and error remediation.
- NFR-07 Performance: measured startup/CPU/RAM/disk in fixture; no unproven blanket 10-minute claim.
- NFR-08 Compatibility: backend schema/app/agent version constraints and backward-compatible APIs.
- NFR-09 Release safety: no push to production without owner approval, CI pass, backup+rollback plan, security assessment.

## 10. Major error scenarios

- VPS IP unreachable → show check cloud firewall, correct public IP, do not request SSH credentials.
- Domain TXT missing → ownership pending, no domain takeover.
- DNS A correct but AAAA incorrect → verify IPv6 or remove invalid AAAA; do not issue a false success.
- Port 80/443 occupied → stop with conflict inventory; never kill unrelated services automatically.
- Low disk / Docker failure → stop before destructive work.
- Pair code expired or already used → new code; no double registration.
- App image signature mismatch → block install/update; security alert.
- DB migration failed → preserve backup and previous app data; operator action, no automatic retry loop.
- Network interruption mid-update → recover from journal and lock safely.
- Center offline → local store continues normally; update queued and retry with backoff.
- Seller revoked pairing → no updates, retain local store; portal state accurate.
- Trial/license expiry (if ever introduced) → grace and explicit policy; never brick store during network failure.

## 11. Dependencies and integration policies

- Prerequisites: Docker Engine/Compose, distro package manager, Caddy ACME, DNS/registrar (manual), PostgreSQL local, OCI registry reachable, signed image distribution, GitHub Actions, trust root/key rotation procedure.
- Next.js build deployability and runtime secret handling require code audit before packaging.
- Data integration: J&T seller-owned official 4 API endpoint configuration per local installation; `Check Fee`, `Create Order`, `Tracking`, `Cancel Order` follow contract/UAT gates; do not copy keys to center.
- Email: seller configures provider/SMTP or supported platform email gateway under separate policy; no implicit free email included.
- Payment: seller configures its own payment service; no checkout claims before ready.

## 12. Milestone gates and acceptance

- **M0 Read-only inventory:** inventory code, migrations, environment variables, dependencies, current deployments, checkout shipping gates, existing auth. Documentation reports only.
- **M1 Local store container:** reproducible signed image candidate, local Compose on disposable VPS, health, data persistence and reset-free lifecycle.
- **M2 Bootstrap and device pairing:** one-line verified installer, pairing test with expiry/revocation/duplicate handling; center registry.
- **M3 DNS/DB/install E2E:** no credentials SSH transmitted, DNS/TLS validation, local Postgres durable, first-run admin, error and retry flows.
- **M4 Signed update pilot:** restricted agent, signed immutable image manifest, canary, preflight, compatibility and app rollback, restore test.
- **M5 Portal UX/operator:** desktop/mobile, support, audit, metrics and permission tests.
- **M6 Pilot and release approval:** clean staging VPS and failure injection, security review, backup and rollback proof, owner approval for any production release.

Full acceptance test matrix: `ACCEPTANCE_TESTS.md`. All P0 tests must pass in disposable environments, no secrets in logs, and zero regression in existing application before pilot.

## 13. Constraints for Codex

- **Do not merge or deploy** on the basis of this PRD alone. Work on dedicated branches and isolated PRs; preserve production.
- Start by auditing actual existing repo and document differences from this proposal; do not assume `apps/` monorepo already exists.
- No reimplementation of commerce features, shipping logic or UI branding without necessity and tests.
- Do not build one-off vendor-specific hosting integration in P0.
- No hard-coded IP/domain, dev credentials, rate quote, license tokens or build secrets.
- Any migration to existing Gheverhan production is a **separate opt-in migration project**, not incidental to this project.
- Observe product terminology: **self-hosted installation**, not multi-tenant SaaS hosting.

## 14. Decision & verification checklist

This PRD is ready for engineering discovery if reviewer agrees: (a) self-hosted Ubuntu-only MVP; (b) one verified bootstrap plus device pairing; (c) per-store DB and seller-owned J&T credentials; (d) agent outbound only; (e) no generic remote shell; (f) signed immutable update + recovery; (g) existing live site stays untouched; (h) release requires explicit review/approval.

## 15. References

- https://nextjs.org/docs/app/guides/self-hosting
- https://docs.docker.com/compose/gettingstarted/
- https://caddyserver.com/docs/automatic-https
- https://www.rfc-editor.org/rfc/rfc8628
- https://docs.sigstore.dev/cosign/verifying/verify/
- https://theupdateframework.github.io/specification/
- https://www.postgresql.org/docs/current/backup.html