# 06 — J&T Express Official API Integration for Multi-Tenant JetSeller

> **Keputusan final 2026-11-02:** **J&T adalah integrasi milik masing-masing seller/tenant** (seller-owned official credentials / BYOK). JetSeller **tidak memiliki satu akun/kredensial operasional J&T global untuk semua toko**. Konfigurasi dilakukan seller owner di dashboard tokonya setelah provisioning. **Bukan scope MVP sekarang**: implementasi form seller OTP → storefront + dashboard lebih dahulu, lihat [09](09_MVP_SELLER_SIGNUP_AUTO_STORE.md).

## 1. Scope dan sumber otoritatif

Dokumentasi resmi: https://developer.jet.co.id/ dan https://developer.jet.co.id/documentation (ditinjau 2026-11-02). Public documentation membahas **Basic Order (AWB)**, **Tariff Checking**, **Tracking**, **Cancel Order**, agreement/cooperation, sandbox, area mapping, provider production testing/approval. Endpoint produksi dan credentials final tersedia melalui dashboard resmi setelah perjanjian; jangan salin kredensial dari demo/dokumen contoh ke kode.

Repo sudah mempunyai modul yang harus diaudit dan dipertahankan:
- `frontend/src/infrastructure/shipping/jnt/jnt-provider.ts` — rate provider, district mapping dan service gate; saat baseline hanya EZ untuk checkout otomatis.
- `frontend/src/infrastructure/shipping/jnt/jnt-config.ts` — validasi mapping/kode wilayah dan konfigurasi operator.
- `frontend/src/modules/shipping/jnt-fulfillment.service.ts` — durable AWB request, idempotency, unknown reconciliation, payment/shipment checks.
- `frontend/src/infrastructure/shipping/jnt/official-transport.ts`, `official-config.ts`, `verified-mapping.ts` — transport/config dan mapping; wajib audit behavior/secret/capability pada HEAD.
- `frontend/src/app/admin/integrations/jnt/page.tsx` serta `components/admin/jnt-integration-settings.tsx` — halaman konfigurasi legacy milik platform/demo pada baseline. **Adaptasikan pada fase J&T menjadi menu Setting → Integrasi J&T di dashboard seller**, dengan **tenant auth dan owner-only credential access**; jangan memperluas izin global `/admin` yang lama. Pisahkan data/kredensial demo lama sebagai compatibility lane sampai migrasi berizin selesai.
- `frontend/src/app/api/v1/webhooks/jnt/route.ts` — route webhook saat ini; investigasi kontrak sebenarnya agar tidak menganggap itu delivery tracking webhook yang telah disetujui.
- `docs/jnt-official/IMPLEMENTATION.md` — catatan historis status UAT/flags; catatan lama bukan bukti live saat ini.

## 2. Keputusan integrasi SaaS: **tenant-managed J&T only**

**Setiap tenant memiliki koneksi J&T Express resmi sendiri.** Seller owner mengisi konfigurasi akun J&T, credentials, origin warehouse, pickup, layanan yang secara resmi didukung, dan menguji koneksi dari **dashboard seller milik tenant tersebut**. Operasi API memakai `CarrierAccountResolver(tenantId)` yang **hanya** mengambil referensi kredensial seller tenant itu dari secret manager, environment sandbox/production terpisah, never exposed to browser. Semua konfigurasi server-side, audited, step-up/reauth for sensitive actions, strongly encrypted. Konfigurasi satu tenant tidak boleh memengaruhi tenant lain.

**Tidak ada mode managed/shared platform credential sebagai fallback.** Super Admin JetSeller hanya mengelola ketersediaan fitur, kebijakan keamanan, rate-limit/circuit-breaker, metadata health teredaksi, dan dapat menonaktifkan koneksi berisiko. Super Admin **tidak** memasukkan, menampilkan, menyalin atau menggunakan secret J&T seller untuk mengirimkan order dari toko lain. Pengelolaan credential dan kontrak operasional dengan J&T merupakan tanggung jawab seller masing-masing, tunduk pada persyaratan resmi provider.

**Kondisi awal tenant:** J&T `NOT_CONFIGURED`, merchant checkout pengiriman tidak dapat diaktifkan hanya karena tenant berhasil dibuat. Di dashboard seller tampil wizard: (1) akun resmi J&T, (2) sandbox/production credential secure form, (3) alamat gudang, (4) test koneksi yang diizinkan dan mapping wilayah resmi, (5) service/UAT approval, (6) activate bila seluruh gate lulus. Rencanakan fitur pada fase berikutnya **setelah MVP pendaftaran toko berfungsi**.

Billing ongkir seller/kurir tetap terpisah dari biaya langganan hosting JetSeller. Persyaratan vendor, kapasitas akun, layanan dan otorisasi per seller harus diverifikasi; tidak boleh mengklaim semua seller otomatis memiliki akses API produksi.

## 3. Carrier capability matrix

| Capability | Dasar publik | Gate JetSeller |
| --- | --- | --- |
| Tariff check | API resmi dengan mapping tujuan | Area mapping disetujui, berat valid, approved credentials |
| Create Order / AWB | Public Basic Order | Paid+packed order, idempotency, valid warehouse, approved service |
| Tracking | Public Tracking API | AWB tenant-owned, rate-limited, status mapping, no raw PII logs |
| Cancel Order | Public Cancel Order (sebelum diproses/pickup) | explicit confirmation, carrier status check, no auto refund |
| HBO / JND / ECO | Mungkin tersedia pada akun tertentu, **belum** didukung Create Order publik secara umum | OFF sampai vendor contract/UAT product types tertulis |
| EZ | Baseline implementasi mendukung | Tetap diblokir production sampai approval environment & J&T UAT |
| COD, insurance | Tergantung perjanjian & kontrak resmi | OFF by default, jangan klaim tersedia |

Public spec menyebut Order membutuhkan `data_param`/`data_sign` dan nomor AWB pada respons sukses; Tariff memakai `data`/`sign`; Tracking menggunakan auth resmi; Cancel mempunyai rule status. Detail signature/URL diperoleh dari dokumen yang disetujui dan konfigurasi aman. Jangan hardcode contoh key atau host tidak diverifikasi.

## 4. Request-to-shipment lifecycle

```text
CHECKOUT shipping quote (server verified)
    -> payment PAID verified and order PACKED
    -> tenant authorized + carrier account active
    -> AWB_INTENT_RESERVED (unique tenant+order+carrier)
    -> CARRIER_REQUEST_PENDING
    -> SUCCEEDED(awb) / REJECTED / UNKNOWN(timeout or ambiguous result)
    -> TRACKING updates and handover events
    -> DELIVERED (carrier evidence) -> commerce completion policy
```

- Reserve carrier request + stable globally unique external order ID **before network** in transactional DB/outbox. Do not automatically retry UNKNOWN; reconcile with J&T/operator using stable external ID.
- Shipment rows and status updates per tenant with owner authorization; AWB and order external IDs must be unique across sellers, not reuse `GH-<hash(orderId)>` without tenant isolation/collision review.
- Handover physically picked up must not be inferred from AWB creation. Carrier Delivered status must be translated via documented status mapping, preserve raw (sanitized) audit & dedupe.
- If refund or order cancellation races carrier request, enforce lock and policy. Carrier cancellation does **not** trigger automatic customer refund.
- Guarantee package weight/size, sender warehouse and recipient address accuracy; J&T area code mapping verified by authorized owner against official L3 dataset. No guessed district/village-to-carrier mapping.
- Quote cache, time-to-live, hash of weight/route/service, price tamper protection and stock checks must be enforced server-side, per tenant.

## 5. Secrets, network dan data protection

Credentials **tenant-scoped** dalam encrypted DB secret references/vault per tenant dan per environment, AES-GCM at rest atau dedicated secret manager; do not expose API key in client, logs, Git, screenshots or chat. Jangan gunakan satu set `JNT_*` environment global untuk operasi seluruh tenant; pisahkan legacy demo jika diperlukan selama compatibility bridge. Egress allowlisted official J&T hostnames + DNS validation (prevent SSRF), TLS verified, bounded timeouts, no redirect to unknown hosts; request/response audit sanitized. Provider contract determines whether webhook exists; if not, use authenticated scheduled polling with jitter, quotas, backoff and reconciliation. Apply tenant-specific rate limit/quotas + global circuit-breaker.

No test may create real AWB, send fake customer data, make real COD, cancel genuine parcels, or probe private QR Fast Order, captcha ticket/randstr or unapproved endpoints.

## 6. Deployment/UAT gating

1. Confirm **tiap seller** memiliki akun/API resmi J&T yang sah, approval produk/layanan miliknya, origin warehouse, tarif, fee reconciliation dan data processing terms; tidak memanfaatkan kontrak seller A untuk seller B.
2. Sandbox credentials **per tenant** dari provider resmi, mapped L3 districts dan allowlisted service types; run sanitized test cases dengan izin J&T per seller.
3. CI contract tests with **mock** transport only; isolated DB simulation of payment→order→AWB intent→tracking; zero real carrier calls.
4. UAT with authorized J&T operator on dedicated approved sandbox / production pilot **separate explicit approval**; verify rate, AWB, pickup, track, cancel, duplicate/timeout and reconciliation.
5. Production flags remain off until owner approves migrations, backup, UAT and monitored rollout per tenant. Feature flag per tenant; staged rollout/kill switch.
6. Incident handling: carrier timeout → UNKNOWN quarantine, no silent retry, manual reconcile queue; credential compromise → rotate; provider outage → fail-closed checkout rates or explicit approved manual alternative.

## 7. Acceptance criteria

- JNT-01: **Seller owner** dapat menyimpan/mengganti/menguji/mencabut kredensial **akun J&T milik tenant sendiri** melalui dashboard seller, tetapi tidak pernah membaca plaintext secret tersimpan. Seller B, staff tanpa izin, customer, dan Super Admin tidak boleh melihat/menggunakan secret seller A.
- JNT-02: Tenant A cannot query/create/cancel AWB belonging B (including forged order ID).
- JNT-03: Unsupported services HBO/JND/ECO cannot be used in Create Order without approved capability matrix.
- JNT-04: Timeout/5xx/ambiguous response cannot cause duplicated AWB on automatic retry.
- JNT-05: Refund and cancel race never creates inconsistent money/stock/shipment.
- JNT-06: Endpoint secrets/PII redacted in logs, errors and audit export.
- JNT-07: No production API calls unless kontrak/akun J&T **masing-masing seller**, config, live switch dan operational approval all verified.
- JNT-08: Tenant baru tidak memiliki J&T credentials secara default, signup tetap selesai, dashboard+storefront tetap dapat dibuat tanpa J&T.
- JNT-09: Tidak ada satu global J&T provider key atau fallback kredensial untuk semua tenant; legacy demo env dipisahkan/ditandai dan tidak tersedia untuk tenant baru.
