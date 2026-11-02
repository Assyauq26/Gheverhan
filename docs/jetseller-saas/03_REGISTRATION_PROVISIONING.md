# 03 — Seller Registration, Onboarding & Provisioning

## 1. UX kontrak

Landing `jetseller.web.id` memiliki CTA **Buat Toko Gratis** → 4 layar pendek:
A. Data akun seller: nama pemilik, email, nomor HP, password + konfirmasi, persetujuan S&K dan kebijakan privasi.
B. Verifikasi email OTP (kode 6 digit, TTL, max attempts, resend cooldown).
C. Identitas toko: brand, slug dan kategori, pilihan template starter; bisa dikoreksi setelah login.
D. Status pembuatan toko: progres terverifikasi, retry yang aman dan tombol Buka Dashboard setelah `TENANT_READY`.

Seller otomatis diberi storefront dan dashboard tenant lebih dulu. **Pilihan paket hosting dan domain ada di dashboard seller**, dengan trial 30 hari. Gudang, pembayaran dan setup J&T selanjutnya melalui wizard dashboard. Tidak boleh memaksa upload foto/nomor rekening/domains sebelum owner dapat dashboard.

## 2. State machine eksplisit

```text
REGISTRATION_PENDING_OTP
  ├── OTP invalid/expired -> PENDING/EXPIRED (NO TENANT)
  └── OTP verified -> SELLER_VERIFIED
                       -> TENANT_REQUESTED
                       -> PROVISIONING
                       -> DB_CREATED
                       -> SCHEMA_MIGRATED
                       -> DEFAULTS_SEEDED
                       -> DOMAIN_CONFIGURED (may be PENDING propagation)
                       -> TENANT_READY
                       -> ONBOARDING_REQUIRED
                       -> STORE_ENABLED (only after commerce safety gates)

Errors: PROVISIONING_FAILED_RETRYABLE / PROVISIONING_FAILED_MANUAL / SUSPENDED.
```

Provisioning worker harus merekam `attempt`, `lastErrorCode` (tanpa secret), `nextRetryAt`, `updatedAt`, `leaseOwner`, `leaseExpiresAt`, `schemaVersion`, `completedSteps`. Compensation tidak boleh menghapus DB yang sudah berisi data aktif; rollback step aman dan manual intervention queue.

## 3. Transaction, idempotency, consistency

- OTP berhasil dan `SellerAccount` + `Tenant` + `ProvisioningJob` + `OutboxEvent` tercatat dalam control-plane DB atomic transaction. Unique index normalized email, slug dan owner-per-tenant, serta `idempotencyKey` berdasarkan challenge atau request ID yang aman.
- Client memanggil status melalui authenticated `GET /api/platform/onboarding/status`; jangan lakukan create-DB di handler OTP dan jangan retry job dengan POST signup ulang.
- Worker menjalankan langkah terpisah yang idempotent: allocate DB descriptor (encrypted reference) → create DB (least privilege) → migrate schema pada DB tenant → seed baseline dengan stable seed keys → create owner (membership owner+role) → domain alias reserve+verify → provision trial entitlement → mark ready.
- Setelah DB tenant benar-benar siap dan endpoint smoke internal lulus, set `trialStartedAt` dan `trialEndsAt = startedAt + 30 x 24h` dengan timestamp UTC, zone hanya presentasi. Re-run tidak memperpanjang trial.
- External DNS/domain/DB provisioning tidak bisa transactional lintas sistem: gunakan saga/outbox, step checkpoint, retry with exponential backoff, reconciliation periodik, dead-letter/manual queue. Surface status PENDING dengan pesan yang jujur.
- Slug tidak bisa diambil orang lain saat provisioning; reserve atomically sebelum job. Rate limit create tenant, captcha publik bila diperlukan melalui provider sah, email verification dan abuse detection.
- Jangan seed staff palsu atau produk pihak lain ke tenant; boleh sertakan template UI, placeholder image berlisensi dan zero checkout mode.

## 4. Domain readiness & failure

- Subdomain sementara dipakai jika wildcard domain platform dan sertifikat sudah disiapkan. Jika belum, berikan dashboard melalui domain platform dengan scope aman (misalnya /seller/<tenant-id> yang server-authenticated) hanya sebagai fallback yang direview; jangan klaim subdomain sudah aktif.
- Storefront public live hanya setelah published theme/default aman, user/toko terprovision, domain status ACTIVE, dan checkout/payment/shipping enabled sesuai kebijakan.
- Onboarding dapat disimpan per step dan dilanjutkan tanpa reset DB. PII yang belum selesai disimpan dengan retensi dan kebijakan penghapusan.
- Bila aktivitas gagal di tengah, owner melihat `Kami menyiapkan toko`, retry manual bila aman, channel support dan no duplicate account.
- Operations Dashboard Super Admin menampilkan stuck jobs, masa retry, trace correlation, secret redacted, retry/repair terbatas dan audit.

## 5. Acceptance test matrix

| ID | Skenario | Expected |
| --- | --- | --- |
| REG-01 | OTP benar | 1 seller & 1 tenant job; customer demo unchanged |
| REG-02 | OTP salah, kedaluwarsa, resend/replay | 0 tenant, generic error dan rate limit |
| REG-03 | 2 submit simultan | Exactly-once logical tenant, unique slug/owner |
| REG-04 | Worker mati setelah CREATE DATABASE | Retry idempotent, tidak DB ganda |
| REG-05 | Worker mati setelah migrasi/seed | Tidak duplikasi role/template/revision |
| REG-06 | DB unavailable / DNS pending | Status transparan, job retry aman |
| REG-07 | Tenant berhasil | Dashboard seller bisa login, storefront default dapat diakses jika DNS ready |
| REG-08 | Trial | Mulai satu kali setelah tenant ready, 30 hari UTC |
| REG-09 | Owner login pada tenant lain | 403/404 tanpa informasi private |
| REG-10 | Demo legacy auth/OTP | Perilaku lama tidak berubah |

## 6. Komponen repo yang harus di-audit sebelum code

- `frontend/src/modules/auth/registration-otp.ts`, `registration-identity.ts`, `registration-contract.ts` hanya dipakai **referensi keamanan**, bukan langsung diarahkan menjadi pendaftaran seller.
- `frontend/prisma/schema.prisma` `PendingRegistration` saat ini tinggal pada data plane legacy: seller pending registration seharusnya di control plane.
- Email provider existing dapat digunakan adapter berbeda dengan template sender, rate-limit dan audit terpisah.
- `frontend/src/modules/appearance/service.ts` tidak boleh membuat published theme seller lain menjadi aktif; seed baseline tepat di DB tenant baru saja.
