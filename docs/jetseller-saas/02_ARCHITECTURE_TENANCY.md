# 02 — Architecture & ADR: Control Plane + Tenant Data Plane

> **Prioritas saat ini:** implementasi seller OTP → tenant provisioned → storefront + seller dashboard, lihat [09](09_MVP_SELLER_SIGNUP_AUTO_STORE.md). Pengiriman J&T merupakan koneksi eksternal per-tenant yang dikonfigurasi seller, bukan koneksi global Super Admin.

## 1. Keputusan dan batas

**ADR-001: satu codebase Next.js, satu deployment aplikasi multi-tenant logis, satu control-plane DB, dan DB tenant terpisah per toko.** Pekerjaan awal adalah melakukan spike migrasi Prisma/runtime dan uji batas pool; tidak menganggap kode `frontend/src/lib/prisma.ts` yang sekarang tenant-aware. Jika operational cost pool/per-tenant Prisma melebihi target VPS, ajukan ADR alternatif dengan benchmark; **jangan diam-diam mengganti keputusan isolasi data**.

**ADR-002: pisahkan trust boundary platform / tenant seller / customer.** JetSeller marketing adalah publik, dashboard Super Admin milik platform, `/admin` pada host toko adalah dashboard seller. Admin legacy dari demo hanya dipertahankan dengan migrasi kompatibilitas.

**ADR-003: provisioning async/idempotent; tidak menjalankan CREATE DATABASE di request HTTP pengguna**. Pekerja provisioning yang diotorisasi khusus memakai least-privilege control plane dan transaction/outbox.

**ADR-004: semua tenant memakai satu versi kode, tetapi migrasi schema tiap tenant dijalankan secara terkoordinasi dengan compatibility window expand/contract, per-batch, dan rollback aman.**

## 2. Diagram deployment logis

```text
Browser -> TLS proxy / trusted Host routing
           ├── jetseller.web.id         [Marketing & signup seller]
           ├── dashboard.jetseller.web.id [Platform Super Admin; proposed]
           ├── slug.jetseller.web.id    [Tenant storefront + /admin seller, once DNS/TLS active]
           ├── custom-domain.example     [Tenant storefront + /admin seller]
           └── gheverhan.store          [Legacy demo; preserve compatibility]
                         |
                Next.js single source release
             ├── Control plane auth/router
             ├── Tenant auth/API/commerce
             ├── Background workers + outbox
             ├── Control Plane PostgreSQL (seller, tenant registry, plan, billing, domain, provisioning)
             ├── Tenant A PostgreSQL DB (own users/catalog/orders/appearance)
             ├── Tenant B PostgreSQL DB (own users/catalog/orders/appearance)
             ├── Tenant N PostgreSQL DB
             ├── Tenant-scoped object media prefixes/buckets and signed URLs
             └── J&T official API via each tenant's own credentials (later phase), email provider, billing PSP, DNS/registrar (approved only)
```

Aplikasi tenant wajib menerima `tenantId` dari trusted routing (DB domain registry), bukan dari body/query/header `X-Tenant` yang dapat diubah pengguna. Misalnya `Host` dinormalisasi dan diverifikasi terhadap proxy trusted list, canonical domain ownership dan status domain ACTIVE. Unknown host harus 404, bukan fallback ke tenant pertama.

## 3. Data boundary

**Control plane:** `PlatformUser`, `PlatformRole`, `SellerAccount`, `Tenant`, `TenantMembership`, `TenantDatabase` (encrypted secret reference, bukan DSN plaintext), `TenantProvisioningJob`, `Domain`, `Plan`, `Subscription`, `Invoice`, `BillingPayment`, `TenantEntitlement`, `AdminAudit`, `OutboxEvent`, `IdempotencyKey`. **J&T credential references disimpan dalam tenant-scoped vault/data plane**, bukan kredensial operasional global control plane. Super Admin hanya dapat melihat metadata status koneksi teredaksi dan mengamankan platform. Model ini usulan, belum ada dalam schema saat ini; tulis migration dan review sebelum membuat tabel.

**Tenant DB:** `User`, `UserRole`, `PendingRegistration` customer, Product/Variant/Inventory/Cart/Order/Payment/Shipment/StoreAppearance dan seterusnya. Seller owner/staff identities disimpan tenant DB dengan platform `SellerAccount` mapping terotorisasi. Sesi owner bisa memakai control plane identity tetapi authorization per tenant harus dievaluasi dengan membership & role yang sah; jangan membuat satu JWT bebas memilih tenant.

**Storage:** Bucket/prefix dengan `tenantId`, path canonical dan ACL server, non-guessable object key, server-side signed operation, per-tenant quota, MIME size validation dan malware/unsafe file screening sesuai kemampuan provider. Cek kepemilikan media termasuk logo, invoice dan shipping label saat akses/download. Tenant migration/backup/export tidak boleh mencampur object prefix.

**Namespace kritikal:** order number, SKU, customer email, cart, webhook nonce, audit IDs dan idempotency key boleh unik per DB tenant, tetapi external J&T carrier order ID, invoice platform dan domain harus unik **global**. Carrier ID harus menyertakan tenant-safe prefix/hash agar tidak tabrakan lintas tenant.

## 4. Tenant DB resolver contract

- Resolve canonical host dari trusted proxy only → domain registry → immutable tenant id/status → verified tenant DB reference → per-request context.
- DB client factory `getTenantPrisma(tenantId)` tidak boleh mengambil connection string dari request; gunakan secret vault KMS/secret manager. TLS wajib, pinning/CA sesuai infra, batas pool, idle timeout dan eviction.
- Control-plane Prisma client terpisah module, schema dan credentials; tenant routes tidak boleh mengimpor client control plane yang bisa menulis tanpa izin.
- Avoid application globals containing current tenant id, cache key without tenant id, process.env mutation per request, unsafe static caching pada data tenant, dan Prisma transaction yang menggabungkan DB berbeda.
- Cache/SSR revalidation/session scopes selalu dibatasi tenant. Tenant A tidak pernah dapat URL CDN/media privat B.
- Pertimbangkan per-database connection explosion: misalnya banyak tenant * pool size; lakukan load test, pembatasan pooling, queue, dan kelas aktivitas sesuai paket. Angka final diputuskan dari benchmark.
- Backup tiap tenant (schema+data+media) dengan restore rehearsal; endpoint delete/export wajib authorization dan retention policy.

## 5. Auth, DNS, migration legacy

- Control-plane login Super Admin khusus hostname dan role kuat; default MFA/step-up untuk operasi kritikal. Seller signup bukan akun Super Admin.
- Seller session scoped by tenant + role + issuer/audience dan cookie/domain yang mencegah cross-subdomain leaks. Customer login per toko; jangan share cart antar seller.
- `gheverhan.store` jadi tenant demo yang diregistrasi eksplisit atau berada di compatibility bridge saat rollout. Jangan migrate DB/demo atau mengubah JWT/Issuer `gheverhan` tanpa strategi token drain/sesi legacy.
- Domain wildcard platform perlu DNS/TLS sesuai desain; onboarding slug tanpa hostname siap hanya dapat status `DOMAIN_PENDING`, dan portal memperlihatkan status nyata.
- Migrasi data legacy ke tenant DB melalui dry-run, checksum, dual-read/compatibility test hanya jika diperlukan; **tidak** otomatis memindah DB produksi.
- Semua tenant schema memiliki versi; release worker memigrasi dalam batch, quarantine gagal, report version drift; source version `N` harus mendukung tenant schema N/N-1 selama masa expand/contract yang disetujui.

## 6. Threat model dan uji isolasi

| Ancaman | Kontrol & uji wajib |
| --- | --- |
| Host spoof/tenant confusion | trusted-host resolver, disallow arbitrary forward headers, unknown domain 404, tests spoof Host/X-Forwarded-Host |
| IDOR/BOLA lintas tenant | lookup seluruh entity di tenant DB, permission checks, negative replay ID tenant lain |
| Super Admin take-over | separate auth/roles, MFA, audit, rate limit, session revocation, least privilege |
| Credential compromise | vault, encryption at rest, no plaintext logs, rotation & separation sandbox/production |
| Connection/cache leakage | client tenant mapping, bounded pools, cache keys and revalidation with tenant ID |
| Provisioning replay | DB unique constraints + idempotent job, transaction/outbox, isolation worker |
| Billing race | invoice uniqueness and webhooks event-dedupe, no double entitlement |
| DNS takeover | challenge verification, lifecycle domain ACTIVE only after TLS and ownership proof |
| J&T duplicate AWB | scoped deterministic external ID, durable request ledger, UNKNOWN quarantine |

## 7. Design review gate sebelum coding migrasi

Buktikan: prototipe pemilihan DB tenant aman pada 2 tenant disposable + legacy demo; stress test 20–100 tenant synthetic; biaya RAM/pool; login/cookie domain; backup/restore; migration dry-run; fail-closed unknown host; secret redaction. Jika tidak layak pada VPS Helipod sekarang, laporkan tradeoff, jangan mengubah arsitektur tanpa ADR dan persetujuan.
