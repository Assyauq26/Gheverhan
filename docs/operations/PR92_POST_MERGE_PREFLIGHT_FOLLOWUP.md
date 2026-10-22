# Tindak lanjut preflight Production setelah PR #92

## Bukti aktual

Run https://github.com/Assyauq26/Gheverhan/actions/runs/39869854390 memakai main `0d7bcac945709a80e1f349073ee54310b585f648`.
Protection, instalasi engine, runtime/direct CONNECT dan metadata identity PASS. Kedua koneksi menuju database `postgres`, schema `public`, transaksi read-only dan schema USAGE tersedia. Tabel existing yang diprobe memenuhi CRUD individual; RLS aktif pada tabel tetapi tidak membatasi role tersebut. Ini tidak membuktikan parity credential GitHub dengan Vercel.

Kontrak V2 BLOCKED: `ProductEditorSave` dan `StagedProductMedia` tidak ditemukan. Ini bukan kegagalan TLS. `backend_tls=false` mengamati sisi pooler–PostgreSQL; tidak membuktikan koneksi client–pooler tanpa TLS. Kedua DSN menggunakan pooler (runtime transaction, operator session), bukan hostname direct PostgreSQL.

Full release gate menghasilkan `RELEASE_METADATA_UNAVAILABLE`; ledger/checksum, Storage dan config lengkap belum terbukti pada run tersebut. Exception asli hilang karena terminal catch kandidat hanya mencetak teks generik. Jangan menyimpulkan SQLSTATE atau penyebab query tanpa run diagnostik baru.

## Perbaikan

Wrapper memverifikasi SHA-256 source preflight kandidat `5d61f30f6fb08530748e2d88324a907ea51bf1ec2f64bae3d5f9a377f7a99cc4` sebelum menambahkan import classifier dan mengganti HANYA terminal catch. Query SQL, gate, Prisma schema, migration dan package script tetap sama. Source dikembalikan pada finally; CA tetap hidup hingga child selesai. Source drift/handler berbeda gagal tertutup. Timeout/interrupted child dibedakan dari metadata yang tidak tersedia.

Catch mengeluarkan hanya kode Prisma/SQLSTATE allowlist; parent membangun ulang diagnostik agar role, DSN, message, stack dan field tak dikenal tidak tercetak. Kegagalan tetap exit nonzero. Tidak menambahkan GRANT, migration, bypass Storage, atau fallback credential.

## Urutan operasional tersisa

1. Review independen PR tindak lanjut, CI HEAD PASS; pertahankan Vercel Ignored Build Step `exit 0` sebelum merge.
2. Setelah merge disetujui, dispatch protected main-only read-only preflight dan approval reviewer environment `production-migration`. Jangan self-approve/bypass.
3. Gunakan kode error aktual untuk perbaikan lanjutan. Jangan menjalankan ulang migrasi hanya untuk membuat preflight hijau.
4. Verifikasi runtime Vercel binding melalui kanal operator aman; GitHub secret binding bukan bukti parity.
5. Inventarisasi Preview berdasarkan snapshot/capability aktual dan kendalikan seluruh writer dengan persetujuan; status Ready historis bukan bukti akses database.
6. Verifikasi private Storage cutover dan V2 migration/recovery menggunakan runbook PR #87. Minta persetujuan spesifik perubahan bucket, migration, isolasi writer, deployment dan cleanup. Backup tambahan tidak dibuat otomatis.
7. Setelah schema, ledger/checksum, role/grants, private Storage dan konfigurasi PASS: controlled release PR #87, smoke test yang disetujui, monitoring. Jangan rollback ke source yang tidak kompatibel dengan session revocation/schema.

Status: NO-GO untuk release Product Editor V2. PR diagnostik bukan izin migrasi/deployment. Production tetap memakai source pra-PR #92; build otomatis hasil merge dibatalkan oleh `exit 0`.
