# R20 — Staging, deployment dan monitoring

Status staging **BLOCKED**: belum tersedia binding yang membuktikan database dummy, JWT key,
storage dan provider terpisah dari production/shared Preview. Environment current revision31
melaporkan tanpa secret/runtime binding/outbound identity. Keberadaan Preview #60/#61 dan
HTTP200 bukan bukti isolasi; tidak dipakai untuk mutation test. Tidak membuat layanan berbiaya,
mengirim email nyata, menggunakan payment gateway real atau memanggil cron production.

Git deploymentEnabled menolak dua branch R20 secara spesifik; Netlify ignore + judul Draft
[skip netlify] mencegah build/deploy otomatis sebelum isolasi. Branch/main lain tidak dinonaktifkan.
Jangan melepas blok ini hanya supaya status deployment terlihat hijau. GitHub test CI terpisah
masih harus berjalan; skip Netlify bukan skip test.

## Persyaratan staging sebelum tindakan remote

Pemilik menyiapkan target staging terpisah dan scoped access: project/database dummy dengan
migrasi dan trusted server role terverifikasi; JWT key berbeda dari production; bucket/storage
terpisah dengan private proof dan ownership policies; mail sandbox/sink, manual payment dan
shipping fixtures; cron nonproduction tidak menunjuk layanan/order production. Credential
hanya lewat koneksi/secret manager environment, tidak melalui chat, file repo atau artifact.
Verifikasi target metadata dan isolasi bersama pemilik sebelum publish atau seed.

## Prosedur release yang menunggu persetujuan

1. Review source PR integrasi/dependency dan unresolved High; pastikan CI wajib SHA final lulus.
2. Cocokkan backup/PITR, restore drill terisolasi, migration ledger/checksum, role/RLS/pooling,
   kapasitas dan lock timeout; tetapkan maintenance window serta penanggung jawab rollback.
3. Dengan persetujuan eksplisit, jalankan migrasi melalui DIRECT_URL yang telah diverifikasi;
   validasi schema/role/session, lalu uji staging end-to-end dengan dummy data.
4. Dengan persetujuan release eksplisit, siapkan build production yang sudah diuji, validasi
   environment/runtime/DB schema, health dan smoke test terkendali sebelum traffic assignment.
5. Promosi/traffic assignment hanya setelah semua quality gate dan owner approval. Tidak ada
   command deploy, migration atau cron production yang dijalankan dalam R20 ini.

## Monitoring dan pemulihan

Pantau auth503/429, gagal login/reset/delivery, revocation/role checks, pool saturation,
lock wait, order/payment mismatch, stok negatif/over-reserved, duplicate sale, voucher quota,
refund/shipping idempotency, proof backlog/expiry dan browser418/navigation failure. Gunakan
metadata/tally yang tidak mencetak bearer, cookie, body proof atau PII pelanggan. Tentukan
baseline dan ambang alert pemilik sesuai traffic, bukan dari benchmark latency sintetis.

Rollback source wajib tetap memahami sessionVersion/revocation; jangan drop tabel atau kembali
ke auth lama yang menerima JWT tercabut. Utamakan roll-forward; PITR sebelum logout/reset perlu
invalidasi global yang disetujui sebelum traffic dibuka. Untuk Netlify gunakan fix-forward,
bukan mempublikasikan snapshot lama dengan endpoint restore. Verifikasi kode dan schema build
pemulihan di staging. Rincian backup/lock/recovery: R20_DATABASE_MIGRATION_READINESS.md.
