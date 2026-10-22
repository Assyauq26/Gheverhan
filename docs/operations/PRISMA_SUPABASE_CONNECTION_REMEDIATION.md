# Prisma–Supabase: CA wiring dan initialization diagnostics

## Scope dan keputusan

Remediation terpisah dari fitur PR87; tidak merge Product Editor V2, deploy, migrate, mengubah secrets/bucket/grants atau menjalankan write probe Production. Branch berbasis main14026ca2598989e9bf987254bcb326a4e4865f01. Actual Production Prisma connectivity setelah perbaikan **BELUM DIUJI**, menunggu review/merge yang disetujui dan approval protected environment. Tidak menyatakan acceptance Production selesai berdasarkan fixture.

## Riwayat dan source yang benar-benar dijalankan

PR88 bootstrap main46d82f5, PR89 DSN diagnostics65ea86e, PR90 typed diagnostics9a1d178, PR91 OpenSSL diagnostics14026ca telah merged. Workflow terakhir39810836275 memakai workflow14026ca tetapi checkout frontend immutable5132575e17eabd9b82dc5d6cce88fabc497b9985 dari PR87. Jadi mengubah file main saja tanpa mengganti source runtime yang dieksekusi tidak memperbaiki probe.

Audit keenam run manual:39793614408 (bootstrap),39800220310 (strict TLS options belum terbukti),39804147514 (shape PASS/generic probe failure),39807514472 (CONNECT/UNCLASSIFIED),39810690186 (protection failure, preflight skipped),39810836275 (shape/TCP/CA OpenSSL PASS, Prisma CONNECT/UNCLASSIFIED). Protection failure dibedakan dari database failure. Tidak mencetak raw log/secret/CA/username.

- [Run terakhir](https://github.com/Assyauq26/Gheverhan/actions/runs/39810836275).
- [Probe yang dijalankan](https://github.com/Assyauq26/Gheverhan/blob/5132575e17eabd9b82dc5d6cce88fabc497b9985/frontend/scripts/release/runtime-role-probe.mjs).
- [Workflow yang dijalankan](https://github.com/Assyauq26/Gheverhan/blob/14026ca2598989e9bf987254bcb326a4e4865f01/.github/workflows/production-read-only-preflight.yml).

## Cacat source yang terbukti

1. Workflow menulis SUPABASE_DB_CA_CERT ke certPath, memakai file hanya pada OpenSSL, lalu finally menghapus directory **sebelum** runtime-role-probe. Probe mengirim DATABASE_URL/DIRECT_URL asli ke Prisma tanpa mengikat CA tersebut. Keberhasilan OpenSSL tidak membuktikan trust store native Prisma identik. Variabel SUPABASE_DB_CA_CERT bukan API konfigurasi Prisma.
2. safeProbeFailure membaca error.code dan error.meta.code saja. PrismaClientInitializationError5.22 menggunakan **error.errorCode**. Fixture asli menghasilkan error.code undefined/error.errorCode P1011 (TLS) atau P1000 (authentication); classifier lama mengubah keduanya menjadi UNCLASSIFIED. Ini membuktikan cacat diagnostik, bukan bukti password Production salah.
3. Source pin workflow berbeda dari main. Remediation perlu overlay operational scripts yang dipin immutable dan diverifikasi, tanpa memasukkan fitur PR87 ke main. Frontend candidate/preflight/Prisma migrations tetap immutable5132575; hanya script ops/test yang di-overlay dari commit remediation reviewed.

**Batas kesimpulan:** underlying exception Production lama telah dibuang classifier; tidak dapat merekonstruksi apakah actual error itu P1011/P1000/native-load hanya dari UNCLASSIFIED. CA wiring defect dan diagnostic defect terbukti; penyebab spesifik CONNECT Production tetap pending satu eksekusi protected yang disetujui setelah remediation. Jangan mengklaim full Production root cause atau successful remediation sampai runtime/direct native Prisma benar-benar diuji.

## Bukti positif dan kontrol negatif

Prisma Client/CLI5.22.0, generated/native engine commit605197351a3c8bdd595af2d2a9bc3025bca48ea2, OpenSSL3. Local disposable PostgreSQL17.11 dengan SCRAM dan server certificate SAN localhost; CI fixture dipin PostgreSQL17.6 manifest f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3. Tidak menggunakan Production bindings.

| Kontrol nyata | Hasil lokal |
| --- | --- |
| OpenSSL dan Prisma dengan file CA benar yang sama | TLS/hostname verified, Prisma CONNECT PASS, SELECT read_only/TLS=true |
| Prisma tanpa CA khusus | P1011; legacy code field undefined |
| sslrootcert menggantikan sslcert pada Prisma5.22 | P1011; sslrootcert bukan supported Prisma CA option |
| CA salah | P1011 / TLS_CERTIFICATE_UNTRUSTED |
| CA benar, hostname127.0.0.1 sedangkan SAN localhost | P1011 / TLS_HOSTNAME_MISMATCH |
| CA benar, password dummy salah | P1000 / POSTGRES_AUTHENTICATION_REJECTED |
| Engine library tidak ada | PRISMA_ENGINE_LOAD_FAILED |
| Server loopback menahan TLS negotiation | bounded network/connection timeout |
| Missing metadata table | P2010 +42P01 / SQL_METADATA_QUERY_FAILED |
| Runtime/direct terkoneksi, tabel V2 tidak ada | connectionStatus PASS, contractStatus BLOCKED |
| Restricted dummy role metadata query | P2010 +42501 / POSTGRES_PRIVILEGE_DENIED |

CA missing/invalid, unsupported TLS options, duplicate URL parameters, wrong target, transaction-pooler DIRECT_URL, malicious error fields dan redaction diuji tanpa koneksi. Semua test credential/CA adalah dummy, kunci server dibuat sementara; public-test-ca.txt bukan CA Production dan tidak memiliki private key dalam repository.

## Semantik Prisma5.22 dan koneksi

Source resmi tag5.22 diverifikasi: [URL parser](https://github.com/prisma/prisma-engines/blob/5.22.0/quaint/src/connector/postgres/url.rs) mengenali sslmode disable/prefer/require, sslaccept strict/accept_invalid_certs dan **sslcert**. sslrootcert libpq tidak dikonfigurasi sebagai CA pada parser ini. [Native connector](https://github.com/prisma/prisma-engines/blob/5.22.0/quaint/src/connector/postgres/native/mod.rs) membaca sslcert sebagai root certificate dan mempertahankan native TLS hostname checking ketika strict. [Dokumentasi Prisma](https://www.prisma.io/docs/orm/v6/overview/databases/postgresql) menjelaskan opsi connector built-in; tidak memakai semantik adapter v7.

[Supabase SSL](https://supabase.com/docs/guides/platform/ssl-enforcement) memerlukan CA yang benar untuk verification; download saja tidak mengonfigurasi driver. [Supavisor Prisma](https://supabase.github.io/supavisor/orms/prisma/) menjelaskan named prepared statements/pgbouncer=true. Tidak mengubah connection mode/pgbouncer/password secara otomatis: failure CONNECT terjadi sebelum metadata SQL; tidak ada bukti prepared-statement conflict pada run lama. DIRECT_URL transaction mode tetap ditolak, runtime direct/session/transaction profiles target tetap diverifikasi. IPv4/TCP PASS sebelumnya adalah observasi terpisah, bukan jaminan semua koneksi/waktu selanjutnya.

## Implementasi minimal

- prisma-transport.mjs memvalidasi target/strict TLS, menolak ignored/ambiguous TLS options, memproses PEM/base64 CA yang valid, membuat file600 di temporary directory700, memasang tepat satu sslcert pada salinan URL proses. Secret tersimpan dan mode/pgbouncer tidak berubah. Kedua URL memakai file CA yang sama. Cleanup finally setelah kedua Prisma connections dan full preflight selesai, termasuk failure.
- prisma-safe-error.mjs membaca errorCode/code/SQLSTATE dengan whitelist. Pesan hanya diperiksa privat untuk kategori tetap; tidak mencetak message/stack/path/host/username/CA. Tidak menurunkan TLS atau menambahkan retry.
- verify-prisma-installation.mjs dijalankan sebelum secret injection pada Ubuntu/OpenSSL3; membandingkan CLI/client/generated/native engine commit dan benar-benar memuat library. npm ci --ignore-scripts + official prisma generate dibuktikan menghasilkan library yang dapat dimuat; generation sendiri tidak dianggap bukti koneksi.
- runtime-role-probe.mjs memeriksa kedua koneksi secara independen, READ ONLY transactions/statement timeout, actual identity/schema/grants/RLS. Role name tidak dicetak; roleObserved dan privilege contract menjadi evidence safe. Connection success dipisahkan dari schema contract BLOCKED.
- run-production-preflight.mjs mempertahankan lifetime CA; setelah koneksi sehat menjalankan official npm run release:preflight dengan URL proses yang sama. Menangkap output secara privat dan hanya menerbitkan boolean/enum allowlist, termasuk ledger/schema/private Storage blockers. Missing V2 tidak membuat pemeriksaan ledger/Storage diam-diam dilewati. Input/report tidak lengkap tetap BLOCKED. Tidak ada weakening gate.
- Workflow memakai dua immutable source pins: candidate5132575 dan operational overlay reviewed. Secret-free install/generate/native-load/unit regressions mendahului satu protected secret step. Protection reviewer independen, no self-review/admin bypass, main-only, minimal permissions dan tidak ada artifact secrets tetap berlaku.

## Operator dan langkah selanjutnya

1. Review remediation PR dan CI exact HEAD. Tidak merge PR87. Tidak bypass required reviewer. Merge remediation hanya setelah persetujuan yang sesuai; merge main dapat memicu Vercel walaupun app source tidak berubah, sehingga kontrol deployment tetap harus dibuktikan operator.
2. Existing secret **SUPABASE_DB_CA_CERT**: CA root/intermediate PEM asli dari project yang benar, atau base64 dari PEM; bukan private key, JSON escaped newline atau libpq URL. CA_PARSE_PASS sebelumnya bukan bukti file dipakai Prisma. Tidak mengganti secret bila existing valid. Koreksi hanya operator berwenang melalui Settings → Environments → production-migration; tidak chat/issue/artifact.
3. Existing DATABASE_URL/DIRECT_URL tetap targetbztprltkevacidcpjaam/postgres/public dengan sslmode=require&sslaccept=strict; jangan menambahkan sslrootcert. Helper memasang sslcert sementara, bukan mengubah stored DSN. Existing unmanaged sslcert ditolak agar tidak menimpa binding path diam-diam; bila terjadi, operator perlu review konfigurasi tersebut. DIRECT_URL bukan transaction6543. Runtime connection mode/pgbouncer dan password tidak diubah.
4. Setelah remediation merged dan approved, dispatch workflow main melalui official GitHub Actions dengan project_ref yang benar. Independent reviewer memeriksa exact candidate+overlay pins dan secret provenance. Jangan melakukan dispatch feature branch atau approval sendiri. Tidak menjalankan ulang workflow lama dari Codex karena belum memuat perbaikan dan tidak akan menjawab exception yang sudah disembunyikan.
5. Wajib bukti runtime/direct connectionStatus PASS dengan native Prisma, identity/grants/RLS, ledger/checksum dan private Storage. Nama secret sama tidak membuktikan GitHub/Vercel deployed snapshot identik; operator tetap harus membuktikan provenance. Environment Codex tidak memiliki Production bindings dan tidak menggunakan credential alternatif.
6. Jika masih failure, kategori/code baru menentukan tindakan: CA/hostname → cocokkan certificate/endpoint; P1000 → operator validasi auth binding, tanpa rotasi otomatis; engine-load → installer/platform; timeout → network/pool; SQLSTATE42501 → role/grants. Jangan mengubah password/grants/mode berdasarkan dugaan atau melakukan migration untuk menguji koneksi.

Release Product Editor V2 tetap NO-GO sampai schema V2, private product-images, old Preview writer isolation, migration/checksum, operasional/security/visual gates serta approval spesifik terpenuhi. Remediation ini tidak mengklaim Preview sudah terisolasi, private Storage siap atau data recovery Production telah diuji. Roll-forward reader staged/session revocation dan seluruh runbook PR87 tetap wajib; tidak reset/drop atau edit migration ledger.
