# 06 — J&T Express Official API Integration for Multi-Tenant JetSeller

## 1. Scope dan sumber otoritatif

Dokumentasi resmi: https://developer.jet.co.id/ dan https://developer.jet.co.id/documentation (ditinjau 2026-11-02). Public documentation membahas **Basic Order (AWB)**, **Tariff Checking**, **Tracking**, **Cancel Order**, agreement/cooperation, sandbox, area mapping, provider production testing/approval. Endpoint produksi dan credentials final tersedia melalui dashboard resmi setelah perjanjian; jangan salin kredensial dari demo/dokumen contoh ke kode.

Repo sudah mempunyai modul yang harus diaudit dan dipertahankan:
- `frontend/src/infrastructure/shipping/jnt/jnt-provider.ts` — rate provider, district mapping dan service gate; saat baseline hanya EZ untuk checkout otomatis.
- `frontend/src/infrastructure/shipping/jnt/jnt-config.ts` — validasi mapping/kode wilayah dan konfigurasi operator.
- `frontend/src/modules/shipping/jnt-fulfillment.service.ts` — durable AWB request, idempotency, unknown reconciliation, payment/shipment checks.
- `frontend/src/infrastructure/shipping/jnt/official-transport.ts`, `official-config.ts`, `verified-mapping.ts` — transport/config dan mapping; wajib audit behavior/secret/capability pada HEAD.
- `frontend/src/app/admin/integrations/jnt/page.tsx` serta `components/admin/jnt-integration-settings.tsx` — halaman konfigurasi yang dibatasi owner saat ini; **migrasikan** menjadi izin Super Admin platform, jangan otomatis buka untuk seller.
- `frontend/src/app/api/v1/webhooks/jnt/route.ts` — route webhook saat ini; investigasi kontrak sebenarnya agar tidak menganggap itu delivery tracking webhook yang telah disetujui.
- `docs/jnt-official/IMPLEMENTATION.md` — catatan historis status UAT/flags; catatan lama bukan bukti live saat ini.

## 2. Model integrasi SaaS yang perlu keputusan kontrak

**Managed platform credential:** Super Admin JetSeller mengelola akses API untuk seluruh tenant jika dan hanya jika J&T secara tertulis menyetujui kontrak reseller/platform, perhitungan biaya per seller, payout dan data processor role.

**BYOK per-seller:** Seller owner menghubungkan kredensial J&T resmi miliknya di dashboard via server-only secure flow, diuji koneksi sandbox/production terpisah dan diproteksi step-up. Credential stored encrypted/vault and tenant-scoped, never client-readable.

Adapter harus mendukung kedua opsi secara abstraksi `CarrierAccountResolver(tenantId)`, tetapi **jangan aktifkan keduanya** tanpa persetujuan dan perjanjian. Seller bukan diberi akses ke master API config platform. Billing shipping per-tenant terpisah dari tagihan hosting.

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

Credentials env/vault per environment, AES-GCM at rest or dedicated secrets manager; do not expose API key in client, logs, Git, screenshots or chat. Egress allowlisted official J&T hostnames + DNS validation (prevent SSRF), TLS verified, bounded timeouts, no redirect to unknown hosts; request/response audit sanitized. Provider contract determines whether webhook exists; if not, use authenticated scheduled polling with jitter, quotas, backoff and reconciliation. Apply tenant-specific rate limit/quotas + global circuit-breaker.

No test may create real AWB, send fake customer data, make real COD, cancel genuine parcels, or probe private QR Fast Order, captcha ticket/randstr or unapproved endpoints.

## 6. Deployment/UAT gating

1. Confirm J&T agreement, approved tenant model, services, origin warehouse(s), tariffs, fee reconciliation and data processing terms.
2. Sandbox credentials from official provider, mapped L3 districts and allowlisted service types; run sanitized test cases with J&T approval.
3. CI contract tests with **mock** transport only; isolated DB simulation of payment→order→AWB intent→tracking; zero real carrier calls.
4. UAT with authorized J&T operator on dedicated approved sandbox / production pilot **separate explicit approval**; verify rate, AWB, pickup, track, cancel, duplicate/timeout and reconciliation.
5. Production flags remain off until owner approves migrations, backup, UAT and monitored rollout per tenant. Feature flag per tenant; staged rollout/kill switch.
6. Incident handling: carrier timeout → UNKNOWN quarantine, no silent retry, manual reconcile queue; credential compromise → rotate; provider outage → fail-closed checkout rates or explicit approved manual alternative.

## 7. Acceptance criteria

- JNT-01: Seller cannot read/edit master credentials.
- JNT-02: Tenant A cannot query/create/cancel AWB belonging B (including forged order ID).
- JNT-03: Unsupported services HBO/JND/ECO cannot be used in Create Order without approved capability matrix.
- JNT-04: Timeout/5xx/ambiguous response cannot cause duplicated AWB on automatic retry.
- JNT-05: Refund and cancel race never creates inconsistent money/stock/shipment.
- JNT-06: Endpoint secrets/PII redacted in logs, errors and audit export.
- JNT-07: No production API calls unless contract, config, live switch and operational approval all verified.
