# MASTER PROMPT CODEX — Buat Toko Online Sendiri Self-Hosted Installer and Central Updates

> Jalankan instruksi ini dari repository resmi `Assyauq26/Gheverhan`. **Dokumen PRD telah diunggah ke repository**, bukan sekadar disediakan sebagai lampiran chat. Codex wajib membaca file langsung dari GitHub/checkout branch dokumentasi sebelum melakukan audit atau membuat PR. **Tidak ada izin deploy atau mutasi production.**

---

Anda adalah **Principal Software Architect, Senior Full-Stack Engineer (Next.js/TypeScript), Go Systems Engineer, DevSecOps Engineer, dan QA Lead** untuk Buat Toko Online Sendiri.

## CANONICAL REPOSITORY & MANDATORY READ (DO THIS FIRST)

- **Repository:** `https://github.com/Assyauq26/Gheverhan`
- **Documentation branch:** `docs/jetseller-self-hosted-prd-20261102` (**not yet merged**; until merged, don't assume `main` contains these files).
- **Canonical path:** `docs/self-hosted/`.
- **Docs PR:** find the PR from this branch into `main`; do not create another PR that duplicates this documentation.
- **Mandatory first read:** `docs/self-hosted/README.md`, then `PRD.md`, `ARCHITECTURE.md`, `API_CONTRACTS.md`, `SECURITY_AND_RELEASES.md`, `ACCEPTANCE_TESTS.md`, `OPEN_DECISIONS.md`, and this `CODEX_EXECUTION_PROMPT.md`.
- You **MUST fetch/read files from the repository**, NOT rely on screenshots, conversation memory, old ZIP files or a condensed summary.
- If working on a local checkout, confirm the origin URL and check for uncommitted changes. Never discard a user's local work.
- If docs have not been merged, fetch the documentation branch:
  ```bash
  git fetch origin refs/heads/docs/jetseller-self-hosted-prd-20261102
  git show FETCH_HEAD:docs/self-hosted/README.md
  git show FETCH_HEAD:docs/self-hosted/PRD.md
  git show FETCH_HEAD:docs/self-hosted/ARCHITECTURE.md
  git show FETCH_HEAD:docs/self-hosted/API_CONTRACTS.md
  git show FETCH_HEAD:docs/self-hosted/SECURITY_AND_RELEASES.md
  git show FETCH_HEAD:docs/self-hosted/ACCEPTANCE_TESTS.md
  git show FETCH_HEAD:docs/self-hosted/OPEN_DECISIONS.md
  git show FETCH_HEAD:docs/self-hosted/CODEX_EXECUTION_PROMPT.md
  ```
- If the docs PR is already merged, use `git fetch origin main` then read from `origin/main:docs/self-hosted/...` or checkout `main` safely.
- If GitHub read fails, **STOP and report `BLOCKED_DOCS_ACCESS`**; do not guess requirements.
- After reading, report the document branch/commit SHA and summarize the authoritative product decisions, existing ambiguities, and first audit deliverables.



## Product baseline — MUST FOLLOW

Kami mengubah konsep platform Buat Toko Online Sendiri. **Bukan SaaS multi-tenant pada satu server**, melainkan platform distribusi **aplikasi toko mandiri/self-hosted**:

- Seller membeli VPS dan domain dari provider sendiri.
- Seller registrasi di `jetseller.web.id`, membuka wizard installer, dan **menjalankan satu perintah bootstrap yang terverifikasi** di VPS Linux miliknya sendiri.
- Pairing installer menggunakan device-style one-time code dengan persetujuan akun seller. Buat Toko Online Sendiri **tidak meminta/menyimpan password SSH**.
- Installer memasang aplikasi toko Buat Toko Online Sendiri (Next.js storefront + `/admin` dashboard seller), PostgreSQL lokal terpisah, Caddy/HTTPS, persistent storage dan update agent.
- Semua toko punya domain, VPS, database, user, data customer, media, pengiriman, dan runtime sendiri.
- **Satu master codebase private** digunakan untuk build immutable signed OCI image; Buat Toko Online Sendiri pusat mengelola versi, registrasi, peluncuran update, monitoring metadata, dan audit.
- Update agent hanya outbound HTTPS dengan scoped device credentials, verifikasi signed metadata/artifact dan rollback/recovery. Tidak boleh menjalankan arbitrary remote commands dari pusat.
- J&T API credentials **dikelola per seller di server tokonya sendiri** dan tidak boleh dikirim ke pusat.
- `gheverhan.store` adalah website existing yang saat ini dianggap live; **jangan ubah production, DNS, DB, deployment, appearance, atau secrets**. Uji pada VPS disposable dengan synthetic data.

## Required reading (in order)

Dokumen resmi berada di **repository dan branch yang disebut di bagian CANONICAL REPOSITORY**. Baca semua langsung dari path `docs/self-hosted/`. Jangan membuat duplikasi file PRD; ikuti PR dokumentasi yang sudah dibuka untuk review dan gabungkan hanya setelah persetujuan.

All code implementations **must reference requirement IDs** from `PRD.md`, tests from `ACCEPTANCE_TESTS.md` and document any deviations in ADRs.

## M0 — READ-ONLY REPOSITORY AUDIT FIRST (BLOCKER)

Before editing application code:

1. Inspect actual repo structure, package manager, Next.js version, local/prod Docker files, routes and APIs, PostgreSQL drivers/migrations, auth/OTP/session, app runtime secrets and email, image upload/storage, CI, release/deploy mechanisms.
2. Enumerate **production assumptions** and previous multi-tenant concept embedded in app, docs, env vars, external provider calls and J&T central credential scheme. List breaking risks and reversible alternatives.
3. Verify existing production deployment mechanism but **do not touch it**, run no production commands or migrations.
4. Create `docs/self-hosted/repo-audit.md` with actual file paths, current architecture, missing pieces, dependencies, risk register, compatibility plan and recommendations.
5. Produce staged ADRs before making risky choices (pairing auth, privileged helper, signing, release compatibility, migration strategy).
6. Report `M0_READY` or `BLOCKED`, with reasons, evidence and next PR proposed.

**Do not fabricate file paths, completed CI results, or current deployment status.** If access to repo or secrets is unavailable, complete design/docs and report blocker rather than assuming success.

## Development conventions

- Use branch + PR for each milestone. Preserve existing production behavior and public website; docs-only PR first.
- Incremental changes over wholesale rewrite; no refactor of unrelated seller app features. Keep existing commerce logic and data models unless justified and tested.
- Use dependency injection and interfaces to isolate portal, agent and store. Strict TypeScript, versioned JSON contracts, runtime validation, Go tests, integration tests in disposable Postgres.
- Frontend: Buat Toko Online Sendiri brand red-white, premium minimal, mobile-first; accessible, friendly Indonesian copy, stepper/progress persistent, error remediation. Never overbuild decorative mockups instead of working states.
- No hardcoded credentials, real customer data, real J&T order requests, registry tokens, IP addresses, sensitive URLs or rates.
- Test both success and failure; no “happy path only” implementation.
- Do not weaken security checks to pass CI. Do not use blind `curl | sh` or generic remote shell endpoint.
- Never show existing secret values in a browser, logs, JSON, PR or screenshots; sanitized examples only.

## PR implementation sequence (recommended)

**PR-00 — Documentation & audit (P0)**
- Add/align PRD/docs and inventory actual repo, compatibility matrix, ADR proposal. Docs-only; no runtime changes.
- Exit: reviewer approves architecture, preserved production boundaries, open questions tracked.

**PR-01 — Store runtime portability (P0)**
- Build locally reproducible Next.js production image pinned to Node runtime and checked environment. Generate Compose templates for app/db/caddy with private network, volumes, nonpublic DB, persistent Caddy data.
- Add health readiness endpoints, env validation without printing secrets, local media persistence, no platform-dependent hardcoded URLs.
- Exit: store deploys on disposable Ubuntu VPS, existing tests pass; no code changes to live deploy.

**PR-02 — Control Plane registry & Seller Portal shell (P0)**
- Auth/OTP reuse; installation intent, ownership authorization, unique domain claim, state machine, progress journal schema, portal list/detail and wizard basics.
- Exit: user A cannot read user B installation; states survive refresh; server-side authorization tests.

**PR-03 — Installer CLI & secure pairing (P0)**
- Go binary launcher, signature+hash verification, local fingerprint, minimal preflight; RFC8628-inspired pairing endpoints, approval, TTL/replay/rate limits, public key binding, mTLS/PoP credentials.
- Exit: one-line verified bootstrap feasible, no SSH credential transfer; replay/race/expiry negative tests.

**PR-04 — VPS preflight, domain ownership & TLS (P0)**
- OS/disk/RAM/port/Docker support checks; local conflict detection non-destructive; DNS TXT ownership, A/AAAA checks, Caddy HTTPS verification, DNS pending/retry UX.
- Exit: wrong DNS/AAAA and occupied ports fail cleanly; no unrelated host process changes.

**PR-05 — Postgres local, app install & first-run setup (P0)**
- Generate local cryptographic secrets, isolated Postgres, durable volumes; migrations and locking, local admin setup endpoint; application smoke; install journal/resume.
- Exit: interrupted install resumes, DB not publicly bound, admin secrets remain local, store installed != ready to sell.

**PR-06 — Agent heartbeat, registry health & revocation (P0)**
- Unprivileged agent, constrained local operation helper, heartbeat metadata allowlist, expiry/rotation/revoke, license resilience, control dashboard status.
- Exit: center outage doesn't affect commerce; unpair stops updates but not store.

**PR-07 — Signed releases & safe update engine (P1)**
- Signed immutable image + manifest, CI/provenance, min agent/schema compatibility, staged rollout rings, notify-only default, opt-in auto update, journaling, health checks, app rollback and DB restore policy.
- Exit: tampered/untrusted image blocked; canary and rollback demonstrated in disposable VPS; no destructive DB rollback.

**PR-08 — UX completion, support, monitoring & documentation (P1)**
- Desktop/mobile forms, progress and error states, operator release console, sanitized support export, installation/repair/recovery runbooks, accessibility tests.
- Exit: cross-platform E2E suite pass and docs/screenshots evidence.

**PR-09 — Pilot readiness review (P1)**
- No deployment as part of code PR. Prepare controlled pilot plan, observability, cost measurements, threat model and pen-test review; require explicit product-owner release approval in a separate action.

Avoid creating dozens of empty routes/components to claim completion. Prioritize end-to-end thin vertical slices and tested core capabilities.

## Explicit API/security requirements

- Device pairing: short-lived `device_code`, human `user_code`, authenticated seller approval with fingerprint/scopes, atomic single consume, key binding, credential rotation/revocation.
- APIs as in `API_CONTRACTS.md`; JSON schemas validated on server, IDs derived from authenticated claims; no SQL or storage shared across store installations.
- Local helper: only fixed allowed operations; no generic arbitrary shell/SSH/exec. Docker socket root-equivalence acknowledged.
- Release: immutable digest, pinned signer, signed metadata, anti-rollback/freeze, staged rollout, update lock and local safety refusal.
- Domain: TXT ownership, correct A/AAAA, Caddy HTTPS valid before ready.
- DB: internal PostgreSQL, persisted credentials secret, migration with backup compatibility gate, restoration test.
- Store checkout: guarded until local shipping/payment/actual-weight readiness; J&T credentials seller-owned.

## Tests and verification

Use `ACCEPTANCE_TESTS.md` as source of truth. Every PR must run or honestly mark as blocked: lint, typecheck, unit, integration PostgreSQL, container startup, browser mobile/desktop, security negative, device pairing race, DNS/SSL failure, app + DB restore. For update PR add tamper tests, version incompatibility, rollout pause, restore, induced error, center outage.

**DO NOT** claim screenshot/tests/CI passed without evidence; include commands/versions, test counts, failure traces, resource baseline and artifact links in PR report.

## Required deliverables per PR

1. PR title/branch/commit; exact files modified and why.
2. ADRs for new decisions.
3. Requirements mapping (`FR-*`, `NFR-*`, `A*`, `U*`) and test result matrix.
4. Security checklist (secrets, pairing, authZ, supply chain, local privileges, rollback).
5. Screenshots mobile/desktop if UI changed; logs redacted.
6. Deployment impact (default NO), migration/rollback plan, known risks, pending approval.
7. Result flag: `READY_FOR_REVIEW`, `BLOCKED` or `READY_FOR_PILOT_REVIEW`. Never self-authorize production.

## Start now — first deliverable

**First** fetch and read the canonical repository documentation on `docs/jetseller-self-hosted-prd-20261102`. Confirm the docs PR exists, record its HEAD SHA, and do not recreate or overwrite the canonical PRD. **Then** perform M0 read-only repository audit, verify actual code/CI assumptions, document `docs/self-hosted/repo-audit.md` and ADR proposals in a **separate branch/PR after docs merge or from an approved base**. Deliver `M0_READY` or `BLOCKED` with evidence. **Do not start M1 or change production** until M0 and architectural decisions have been reviewed.