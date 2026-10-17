# R21 — Controlled production release tanpa staging

**STATUS: NOT READY. DOKUMEN INI BUKAN OTORISASI EKSEKUSI.** Pemilik memutuskan tidak membuat staging. Tidak ada project/database cloud/deployment staging/server baru atau pembelian layanan. Persiapan diuji hanya pada build lokal, PostgreSQL disposable dan provider double. Risiko provider/recovery yang tidak dibuktikan tidak disamakan dengan PASS.

## Paket persetujuan dan penanggung jawab

Pemilik menunjuk release lead, DBA/backup operator, finance verifier dan operator recovery. Catat waktu UTC, identitas project/deployment/database/role, SHA exact, checksum migration/lockfile/build, backup manifest terenkripsi dan penerima kunci publik, command/config diff yang disetujui, maintenance window, stop criteria dan decision log. Approval terpisah atau satu approval tertulis yang secara jelas mencakup seluruh tindakan berikut: merge source final, production maintenance configuration/deployment, pembuatan backup, migrasi auth, invalidasi sesi legacy, deployment aktif, financial smoke data dan emergency recovery. Tidak ada tindakan itu dilakukan dalam R21 ini.

Review Draft R21 sebagai integrasi terlengkap #60–#64; #64 hanya docs di atas #63. Jangan merge semua PR lama berantai. Pertahankan #59 dan backport React/checksum guard. Final review harus menunjuk HEAD yang sama dengan kedua CI PASS, unit/containment/PG/browser/hydration dan gate10×44. Review mitigasi7High resmi OPEN, parser7 compatibility, logging, role/RLS, configuration gaps dan penerimaan risiko tertulis. Source review bukan persetujuan production.

## Pre-deployment — hard stop sebelum live write

1. Verifikasi domain `gheverhan.vercel.app` → project/deployment/source production yang benar. Konfirmasikan DATABASE_URL dan DIRECT_URL melalui kanal operator aman; cocokkan project ref/role/pooler/region/SSL, bukan nama project. Jangan kirim URL/secret ke chat.
2. Pastikan build/install/root dir/Node22, Vercel Git automatic deployment, runtime env, region dan protection/required checks sesuai. Jangan melakukan merge yang tanpa sengaja membuka auth baru sebelum migration readiness.
3. Review konfigurasi startup/login/storage/reset/cron/manual payment/shipping. Secret presence bukan bukti validitas/delivery. Jangan mengisi placeholder production, mengirim email nyata, mengaktifkan real gateway atau memanggil cron untuk mencoba konfigurasi.
4. Tentukan backup existing off-site milik pemilik, enkripsi authenticated, ACL/retention/kunci terpisah, cakupan Storage dan peran/grant. Approve RPO/RTO; Free tidak menjamin daily/PITR. Dummy restore proof tidak membuktikan backup production sudah ada.
5. Dapatkan persetujuan tertulis langkah/window di atas. Bila identity, backup, penerimaan High/configuration atau maintenance profile belum jelas, **STOP**; jangan menggantinya dengan shared Preview atau production testing.

## Profil tertutup — source sama, schema lama belum boleh menerima auth

R21 menyediakan `MAINTENANCE_MODE=1`: middleware mengembalikan503/no-store untuk halaman bisnis, API, Server Actions dan cron sebelum auth/Prisma. Hanya GET/HEAD `/api/v1/health` serta static assets yang lewat. Nilai tidak dikenal juga menutup traffic; unset/0 membuka mode normal. Profile/flag harus eksplisit pada paket release. Tidak ada bypass secret atau endpoint mutasi yang dikecualikan.

Setelah approval production:

1. Operator menetapkan flag1 pada konfigurasi production yang benar dan melakukan deployment **profil tertutup** dari SHA reviewed. Ini tindakan production, bukan staging, dan belum dilakukan. Main lama dapat mengabaikan flag sampai source R21 tersedia; jangan mulai backup/migrasi hanya karena env sudah disimpan.
2. Verifikasi deployment/commit, health200 dan status503 nyata pada `/`, `/shop`, `/login`, POST API orders/login, POST Server Action dan cron. Jangan mengirim payload bisnis nyata. Bila ada route mutasi yang lewat, **STOP**. Source build/profile tertutup wajib telah dibuktikan lokal terhadap lima migration; tidak mengandalkan health untuk schema readiness.
3. Inventarisasi dan tutup seluruh writer ke database, termasuk immutable deployment URL lama, shared Preview, alias Netlify/hosting lain, webhook dan koneksi operator. Middleware kandidat hanya menutup deployment yang memuat source tersebut; pergantian domain produksi tidak menonaktifkan fungsi deployment lama. Gate/protection lama harus diverifikasi, bukan diasumsikan dari satu SSO setting. Jika tidak dapat menghentikan writer lain dengan kontrol yang disetujui, jangan mengklaim freeze/RPO0 dan STOP migrasi. Drain request/function/DB transaction yang sudah berjalan sebelum gate aktif. Hentikan writer/background/external workflow yang disetujui; pastikan tidak ada business/auth write tersisa. Cached UI lama mungkin masih terlihat, tetapi semua network mutations harus tertutup. Gate tanpa drain bukan backup RPO0.
4. Ambil backup production hanya setelah approval khusus, dari kanal/perangkat operator tepercaya, stream langsung ke ciphertext. Jangan menaruh customer dump/private key di runner ini/CI/chat. Backup DB tidak otomatis mencakup bytes Storage. Verifikasi authenticated decrypt/integritas, inventory/manifest/schema list secara aman; jangan restore customer data ke environment pengujian. Restore drill sebelum release tetap memakai data dummy.

Jika organisasi tidak menerima prosedur maintenance/cold cutover tanpa provider smoke terisolasi, pertahankan NOT READY dan minta keputusan risiko atas paket konkret ini; jangan membuat staging melawan keputusan pemilik.

## Database migration — hanya setelah approval dan backup

1. Cocokkan ulang identitas project/database/role dan ledger/checksum lima historis. Jangan mengasumsikan project connector adalah binding deployment. Gunakan koneksi direct khusus migrasi yang dipersiapkan secara aman.
2. Jalankan read-only checks pada source reviewed melalui kanal operator. `npm run release:preflight` membutuhkan ref non-rahasia `R21_EXPECTED_SUPABASE_REF` yang telah dikonfirmasi dan flag eksplisit `R21_ALLOW_PRODUCTION_READ_ONLY=1` untuk remote; script tidak menampilkan secret. Schema5 menghasilkan BLOCKED secara sengaja. Keberadaan config bukan verifikasi provider/backup.
3. Terapkan hanya migration reviewed `20261017000000_auth_session_controls` melalui `npm run prisma:deploy` dengan source/lockfile frozen, target direct terverifikasi dan lock/statement budget yang disetujui. **Jangan menjalankan command ini dari chat/runner sekarang.** Jangan `db push`, seed/bootstrap, reset, atau menghapus migration historis. Jangan membungkus seluruh migration history dalam BEGIN karena index historis CONCURRENTLY.
4. Jika timeout/failure: pertahankan gate503; inspeksi ledger, kolom/tabel/indeks/constraint parsial dan transaction state. Backup tetap tersedia. Tentukan roll-forward/transaction repair ter-review. `migrate resolve --rolled-back` hanya setelah objek benar-benar cocok strategi retry; jangan menandai applied tanpa bukti.
5. Verifikasi keenam migration/checksum, default integer version0, FK cascade, lima indeks valid, RLS enabled, seluruh hak SELECT/INSERT/UPDATE/DELETE dan full revocation visibility role aplikasi. Jalankan preflight memakai credential aplikasi efektif; role connector postgres bukan bukti. Pool/per-instance budget dan SSL harus sesuai batas/region.
6. Putuskan sesi legacy. Main lama tidak menyimpan revocation logout; token historis yang sudah ditangkap tidak otomatis menjadi aman setelah tabel kosong dibuat. Rekomendasi: approval invalidasi semua legacy version0→1 dalam maintenance sebelum issuance auth R21 pertama. Operasi idempotent ini memaksa user login ulang; jumlah/actor/event harus dicatat aman. Jika memilih mempertahankan sesi0, pemilik harus menerima residual replay historis secara tertulis. Tidak mengubah signing key/format token atau menjalankan update live di R21 ini.
7. Read-only preflight setelah migrasi/konfigurasi harus PASS. Jangan membuka traffic apabila trusted role, secret/provider, index/ledger atau integrity gate gagal.

## Aktivasi aplikasi

Build/deploy profil aktif `MAINTENANCE_MODE=0` dari SHA yang sama hanya setelah schema6 dan konfigurasi/approval siap. Middleware mode adalah bagian konfigurasi artifact, bukan asumsi flag dapat diubah tanpa rebuild/deployment. Verifikasi flags pada deployment efektif; local runtime toggle tidak membuktikan perilaku binding provider. Tidak mempromosikan Preview yang memakai env berbeda.

Pemilik memberi keputusan go/no-go pada paket hasil migration/preflight/backup. Tetapkan operator monitoring aktif sebelum domain/traffic dibuka. Tidak menggunakan rollback otomatis ke main lama. Simpan artifact profil tertutup R21 untuk emergency traffic stop; artifact itu memahami schema auth baru ketika traffic dibuka kembali dengan source kompatibel.

## Smoke pasca-deployment yang disiapkan

Semua dilakukan setelah approval, dengan account/SKU/data uji yang disetujui dan volume terbatas. Jangan membuat test order PAID biasa lalu menghapusnya untuk membersihkan laporan. Schema saat ini tidak mempunyai financial test-isolation flag; full write smoke live tetap BLOCKED sampai finance menyetujui mekanisme exclusion/reconciliation yang dapat diaudit. Alternatif keputusan pemilik: validasi write lokal yang sudah terbukti, lalu observasi transaksi sah pertama; catat residual risk, jangan menyebutnya dummy production proof.

| Skenario | Verifikasi / pembatasan |
| --- | --- |
|1 Homepage | HTTPS200, asset/SEO/visual dasar, tidak ada error |
|2 Shop | Produk/price/pagination/search sesuai; GET saja |
|3 Login | Account uji approved, cookie aman, RBAC benar |
|4 Logout | Cookie hilang dan replay captured token ditolak; token disimpan hanya sementara di alat aman |
|5 Cart |3→2→checkout→Back, badge/quantity sinkron; tidak ada hard refresh |
|6 Checkout | Quote server, shipping/voucher/rate benar; preview belum membuat order |
|7 Order creation | Request id sama→satu order/reservation; hanya setelah financial test plan disetujui |
|8 Payment confirmation | Proof dummy approved/private; WAITING_VERIFICATION, bukan PAID |
|9 Admin verification | Approval/reject/resubmit sesuai role dan financial reconciliation approved |
|10 Inventory | SKU uji approved, exact reservation/sale/release; tidak memakai stok customer |
|11 Order status | Buyer/admin/dashboard domain/presentation konsisten |
|12 Customer account | Data owner-only, akun lain/admin tak berhak ditolak |
|13 Navigation | Back/Forward/native streaming dan viewport390/768/1024/1360 |
|14 Hydration | Nol #418/page errors/stuck navigation; tidak menyembunyikan error/reload paksa |
|15 Health | Liveness200; schema/role/provider dicek terpisah, bukan disimpulkan dari health |

Status/money/stock catatan uji tidak boleh dicampur dengan revenue/fulfillment biasa; tidak ada jalur otomatis untuk mengecualikan catatan test saat ini. Jika persyaratan ini tidak dapat dipenuhi, jangan menjalankan write smoke live. Tidak mengeksekusi cron terhadap order production sebagai smoke. Rekonsiliasi backlog1 pada project yang diperiksa memerlukan identitas target dan approval; source membatasi batch50/idempotent, jangan loop tak terbatas.

## Monitoring, stop criteria dan recovery

Pantau baseline/alert yang disetujui:5xx/auth503/429, login/reset delivery, RLS/DB capability failure, connection pool/lock wait, order/payment mismatch, negatif/over-reserved stock, duplicate sale/order, voucher quota, refund/shipping retries, proof/expiry backlog, browser #418 dan navigasi macet. Hindari log bearer/cookie/reset token/body/SQL args. R21 logger hanya kelas/kode allowlisted; lifecycle audit hanya ID/action.

Stop dan kembalikan ke profil maintenance tertutup jika terdapat auth fail-open/revoked token accepted, duplicate financial write/oversell, mismatch yang tak dapat direkonsiliasi, migration/role failure, browser stability regression atau error/latency melebihi ambang owner. Tidak melakukan refund, release stok, atau reapproval massal sebagai workaround.

Prioritas recovery: traffic stop → preserve evidence/backup → review/roll-forward → verifikasi → owner reopening. Jangan drop tabel auth atau rollback melayani user dengan deployment lama yang mengabaikan sessionVersion/revocation. Kandidat R20 d002623 sudah memahami auth controls tetapi tetap mempunyai residual dependency lama; bukan fallback otomatis yang disetujui. Fallback harus dibuild/test dengan konfigurasi aktual dan menerima review security sebelum dipakai melayani traffic.

Restore snapshot setelah business/auth write dapat menghidupkan JWT/reset link/password/account state lama dan menghilangkan settlement/reservation. Increment sessionVersion+1 setelah restore dapat bertabrakan dengan token yang pernah diterbitkan; bukan invalidasi global yang pasti. Tahan traffic, dapatkan approval incident recovery untuk signing-key invalidation atau epoch terbukti tak terpakai, invalidate reset links, rekonsiliasi account/role/password changes serta bank/proof/stock/voucher/refund/shipment. Jangan menerima dual old signing key yang menghidupkan token lama. Tidak merotasi/mengubah credential live sekarang.

Jika data/backup/provider identity atau integrity tak dapat dibuktikan, layanan tetap tertutup dan eskalasi pemilik; RTO/RPO tidak boleh diklaim tercapai dari dummy drill. Pemulihan production/ciphertext/private keys hanya melalui kanal aman dan persetujuan yang tepat, bukan customer-data restore di environment test.

Kuota autentikasi menggunakan namespace environment yang stabil. Verifikasi metadata server Vercel/Netlify sesuai deployment; metadata invalid/konflik fail-closed 503. Rollout mereset budget satu kali, kemudian semua instance memakai namespace yang sama. Jangan rollback ke limiter lama tanpa namespace. Namespace tidak mengisolasi credential/database shared; lindungi semua Preview/immutable URL dan hentikan penulis lama sebelum cutover. Hak DELETE pada kedua tabel kontrol wajib untuk cleanup kedaluwarsa.
