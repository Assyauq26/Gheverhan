# R21 — Performance dan stability

Tidak ada stress test production. Seluruh benchmark menggunakan build production lokal, PostgreSQL17 disposable, Node22 dan loopback storage double. Tidak ada provider nyata, customer rows, staging/cloud service baru atau biaya tambahan. Keputusan tanpa staging tidak diubah.

## Metode yang dapat direproduksi

`tests/integration/performance-local.ts` menolak host non-loopback, nama database selain `gheverhan_perf_sprint1_test`, atau flag isolated yang tidak eksplisit. Database harus kosong dan sudah bermigrasi6. Server/bucket double bind127.0.0.1 port3131/3132; port diperiksa sebelum mengirim request. Redirect tidak diikuti agar login/protection redirect tidak terlihat sebagai endpoint PASS.

Dataset:500 produk published,500 variant/inventory,50 voucher,10 flash sale aktif dan300 order historical dummy, read buyer/admin dan buyer checkout terpisah. History fixture sengaja berstatus cancelled/expired; pengujian transaksi baru tetap memakai API/auth/service nyata. Concurrency1→2→4,100 request per endpoint/tingkat, pool4 per client; bukan beban ekstrem. Setiap route di-warm-up; fixture writes berada di luar latency create-order HTTP. Tidak menjalankan test DB lain bersamaan dengan benchmark final.

Cakupan: homepage, shop, detail product, search, cart, checkout page, checkout preview API, orders, admin dashboard, inventory, marketing, create order, idempotent replay, payment confirmation dan scarce inventory. HTTP timing mencakup respons/body HTML/JSON, bukan browser rendering/LCP. Functional browser dan navigasi/hydration diuji terpisah.

## Pemisahan metrik wajib

| Metrik | Definisi dalam JSON |
| --- | --- |
| Request/s | Jumlah request phase / wall seconds; GET, preview, create, replay, proof dipisahkan |
| Checkout attempt/s | Hanya request create-order phase, bukan semua HTTP request atau replay |
| Successful order/s | Pertambahan order unik DB / phase seconds. Replay100 sukses HTTP tetap0 order baru |
| p50/p95/p99 | Nearest-rank latency dari100 sampel per phase. Burst/descriptive quantiles, bukan SLO atau kapasitas sustained |
| Error rate | HTTP>=400 dipisahkan dari unexpected error rate. Scarce stock mengharapkan3 sukses/5 conflict; konflik bukan server failure |
| CPU | Delta utime+stime proses Node server, dinormalisasi satu core; bisa>100% dengan threads. Bukan CPU PostgreSQL atau Vercel |
| RAM | Peak sampled RSS Node. Host RAM/logical CPU dilaporkan untuk konteks, bukan limit provider |
| DB connections | Sampel pg_stat_activity untuk database benchmark, termasuk client monitor, bukan asumsi semua dari request |
| Lock wait | Sampel wait_event_type=Lock setiap200ms; brief wait dapat terlewat. Nol sampel bukan bukti tidak pernah menunggu lock |
| Duplicate/oversell | DB unique count, inventory/reservation/movement dan payment status diverifikasi setelah request |

Ekspektasi:300 checkout unik +300 replay menghasilkan300 order, bukan600;100 proof menjadi WAITING_VERIFICATION dengan reservasi tetap;8 attempt atas stok3 menghasilkan3 order/5 conflict. Total baru303 (603 dengan history), reservasi303, tidak negatif/over-reserved, nol duplicate order/oversell. Latency create/replay/proof dan success-order rate tetap tabel terpisah.

Prequalification100-sample PASS membuktikan harness/invariant; hasil awal12-sample bukan bukti statistik final. Kegagalan awal proof403 berasal dari origin harness127.0.0.1 versus canonical localhost Next; driver disamakan dengan browser tests tanpa mengubah pemeriksaan Origin aplikasi. Percobaan top-level-await CJS dan displayName bank fixture diperbaiki sebelum kualifikasi. Tidak melonggarkan assertion atau menyembunyikan error.

## Bukti final per-SHA

Laporan ini dibekukan sebelum gate agar hasil tidak mengubah HEAD. Angka final dan tabel seluruh endpoint/tingkat dihasilkan dari:

- `/workspace/scratch/r21/evidence/final-performance/performance-results.json`.
- `/workspace/scratch/r21/R21_PERFORMANCE_RESULTS.md`.
- `/workspace/scratch/r21/FINAL_RESULTS.md` dan deskripsi/check Draft R21.

JSON menyimpan commitSha, sourceDirty, Node/buildId, dataset, status/error counts, percentiles, request/attempt/order rates, resource summary dan invariants. Final qualification mensyaratkan working tree bersih (`R21_FINAL_QUALIFICATION=1`); hasil prequalification yang masih mengandung WIP bukan bukti final SHA.

## Stabilitas dan profil release tertutup

Gate aktif final tetap10×44,11 checkpoint pada390/768/1024/1360 per run, satu SHA/build/Node/browser, nol page/hydration errors dan tanpa diagnostic patches. Native Next navigation/streaming dan backport checksum-guarded tetap dipertahankan; tidak ada hard reload, timeout workaround atau error suppression browser.

Profil MAINTENANCE_MODE1 diuji terpisah: closed build terhadap schema5, health200, delapan contoh request halaman/API/Action/cron/POST-asset503 dan schema auth tetap belum tersedia. Ini bukan gate aktif dan tidak dipakai untuk mengganti10×44. `closed-build-local.py` menolak target non-disposable, memakai copy source tanpa .env/.git/credential, lalu menghapus copy. Hasil final berada di `final-closed-build/closed-build-results.json`.

Local RPS/latency/CPU/RAM tidak membuktikan kapasitas Vercel/Supabase Free, cold start, WAN, pooler, storage nyata, sustained load atau SLA. Risiko provider, observability403 dan budget connections tetap memerlukan review/acceptance pemilik sebelum controlled release. Tidak menaikkan paket atau melakukan benchmark live untuk menutup keterbatasan ini.
