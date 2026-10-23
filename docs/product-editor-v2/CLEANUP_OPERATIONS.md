# Cleanup operations — belum diaktifkan

Detail TTL/cancel/tombstone/finalized safety di STORAGE_PRIVACY_AND_CLEANUP_RUNBOOK.md. Endpoint GET /api/internal/cron/product-media-cleanup default disabled; flag literal 1 + VERCEL_ENV production + Bearer timing-safe CRON_SECRET minimal 16. Tidak ada schedule source baru. Tidak ada invocation Production pada audit ini.

Bearer bukan nonce sekali pakai; replay secret valid dapat mengulang invocation. Keamanan replay operasi bergantung pada kondisi CAS, productId null, idempotent delete dan tombstone, bukan klaim request anti-replay kriptografis. Jangan mengungkap/menaruh Bearer di URL/log. Concurrent invocation dapat menduplikasi DELETE provider; tidak menghapus finalized. Production scheduling overlapping harus dicegah operator; suite menguji race finalization/cancel dan retry.

## Kapasitas

Satu invocation memilih maksimal 5 baris eligible, lima I/O paralel dengan timeout 15s masing-masing; DB overhead menambah durasi. Batas function harus diuji pada plan aktual, bukan menganggap 15s total pasti. Satu abandoned row bisa butuh dua kunjungan: cancel+remote delete, lalu delete ulang setelah grace 24h sebelum metadata dihapus. Maka **5 visits/hari bukan 5 object selesai/hari**. Worst-case steady state harian sekitar 2,5 object baru/hari sebelum retry/traffic cleanup. Provision envelope maksimum 2 object/hari bila hanya satu daily invocation dan tanpa failure, dengan margin kecil; bukan SLA.

Dokumentasi resmi https://vercel.com/docs/cron-jobs/usage-and-pricing diverifikasi 22 Oktober 2026: Hobby maksimum 100 jobs/project, minimum cadence sekali sehari, precision per-hour ±59 menit. Jangan membuat banyak jadwal sebagai bypass frequency; tidak membeli/upgrade. Existing expire-orders schedule perlu ditinjau terpisah. Tidak menjanjikan physical purge persis 24h: akses berhenti pada expiry, tombstone grace dan jadwal membuat deletion lebih lama.

Rumus backlog visits: V = 2A + R, dengan A abandoned objects/hari dan R kunjungan retry/hari. Harus V < 5C, C invocation/hari yang didukung/disetujui. Backlog B visits tanpa arrivals memerlukan ceil(B/5) invocation, ditambah grace. Volume saat ini 0 staged bukan forecast upload. Cadence usulan harian hanya bila volume dan SLA disetujui; selain itu BLOCKED capacity.

## Monitoring/operator

Owner operasional dan alert destination **belum ditetapkan**. Wajib menunjuk operator release dan on-call sebelum approval aktivasi. Pantau structured counts scanned/cancelled/deleted/failed; partial failure HTTP 503 bukan PASS. deleted menghitung metadata sesudah provider DELETE sukses, bukan semua DELETE yang dilakukan. Jangan mengekspor actor/session/path.

Setelah schema tersedia, query read-only backlog sebagai role berizin:

```sql
SELECT count(*) FILTER (WHERE "productId" IS NULL AND "expiresAt"<=now()
 AND ("cancelledAt" IS NULL OR "cancelledAt"<=now()-interval '24 hours')) AS eligible_visits,
 count(*) FILTER (WHERE "productId" IS NULL AND "cancelledAt">now()-interval '24 hours') AS in_grace,
 min("expiresAt") FILTER (WHERE "productId" IS NULL AND "expiresAt"<=now()
 AND ("cancelledAt" IS NULL OR "cancelledAt"<=now()-interval '24 hours')) AS oldest_eligible
FROM "StagedProductMedia";
```

Jangan jalankan sebelum tabel tersedia; sekarang NOT APPLICABLE. Alert setiap failed>0/503, eligible >= 5 dua run berturut-turut, oldest eligible melebihi satu cadence+precision sesudah eligible. Operator diagnosis provider/grants; bounded retry setelah perbaikan dengan approval invocation; platform tidak diasumsikan retry otomatis. Emergency disable flag 0 dan pause schedule membutuhkan otorisasi operasional; tidak delete metadata/file massal. Metrics/alert otomatis belum dipasang, gate operational **BLOCKED** sampai owner/cadence/monitoring dikonfirmasi.
