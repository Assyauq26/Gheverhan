# Sprint 2H — Nomor Resi Otomatis Menandai Paket Dikirim

**Status:** Implementasi pada PR; belum berlaku di production sebelum merge.  
**Platform:** Next.js di Vercel, PostgreSQL Supabase, mode shipping manual (belum menggunakan API kurir).

## Keputusan bisnis

Seller/staf pengiriman menyatakan **paket sudah diserahkan kepada kurir** ketika memasukkan nomor resi dan mengonfirmasi penyimpanannya. Untuk pesanan berstatus `PACKED` (Dikemas), pengisian resi otomatis memperbarui:

| Komponen | Sebelum | Setelah simpan resi |
|---|---|---|
| Order | `PACKED` | `SHIPPED` |
| Shipment | `PENDING`/`PROCESSING` atau belum ada | `SHIPPED` |
| Nomor resi | Belum ada | Resi yang dimasukkan |
| Tanggal kirim | Kosong | Waktu server pertama kali dispatch |
| Riwayat/audit | - | Shipment event, order transition, audit staf |

Tidak diperlukan langkah pemilihan `SHIPPED` terpisah. Konfirmasi form secara eksplisit menyatakan bahwa resi hanya boleh disimpan setelah handover kurir. **Aplikasi tidak memverifikasi pickup melalui API kurir**: status merupakan pernyataan operasional dari staf, bukan scan fisik carrier yang diverifikasi otomatis.

## Aturan fail-closed

1. Perubahan membutuhkan sesi staf dengan izin `shipping.update`, mutasi origin yang sah, order lock, status pembayaran `PAID`, serta tidak ada refund aktif. Tidak dapat digunakan pembeli atau staf tanpa izin.
2. Untuk order `PAID` atau `PROCESSING`, form tidak menampilkan field resi. Pengiriman nomor resi baru lewat API pada tahap ini mengembalikan HTTP 409 dan tidak melewati proses `PACKED` secara diam-diam.
3. Field status disembunyikan ketika order `PACKED`; request tetap membawa status internal, lalu backend menentukan `SHIPPED` secara atomik berdasarkan resi. Backend tidak mempercayai pemilihan status di browser.
4. Order `SHIPPED` boleh melanjutkan ke status pengiriman `IN_TRANSIT` dan `DELIVERED` sesuai state machine. Perubahan resi yang sah tidak menurunkan status pengiriman. Refund/pembatalan tetap dilindungi aturan sebelumnya.
5. Jika belum ada resi saat status `PACKED`, menyimpan catatan saja tidak otomatis membuat status `SHIPPED`.
6. Setelah dispatch pertama, tanggal kirim tidak ditimpa pada retry/edit. `requestId` yang sama dan payload sama mengembalikan hasil tanpa event/riwayat duplikat; kunci sama dengan payload berbeda ditolak 409.
7. Tidak ada migrasi/backfill/SQL UPDATE pada transaksi lama. Record sebelumnya yang sudah mempunyai resi tetapi masih `PROCESSING` tidak otomatis berubah saat deploy. Perbarui hanya setelah staf mengonfirmasi kembali di UI.

## Pengujian yang harus PASS

- Unit/typecheck/lint/build Next.js.
- PostgreSQL terisolasi: satu dispatch walaupun request paralel, persis satu event/history/audit, timestamp pertama tetap, requestId idempotent, resi dari order non-PACKED ditolak, refund serta integritas stok tetap terjaga.
- Chromium/Next.js local: field resi tidak terlihat sebelum `PACKED`; setelah `PACKED`, seller hanya isi nomor resi (tanpa memilih `SHIPPED`) → order dan shipment keduanya `SHIPPED`.
- Production: hanya status deploy READY setelah merge **tidak** membuktikan input resi bekerja. Uji input melalui pesanan yang memang sudah diserahkan kepada kurir, tanpa memalsukan pengiriman/pembayaran. Tindakan ini mengubah data transaksi nyata sehingga perlu persetujuan operator terkait.

## Rollback

Jika terjadi regresi produksi, rollback deployment Vercel ke release READY sebelumnya. Rollback kode **tidak** membatalkan status `SHIPPED`, nomor resi, atau jejak audit yang sudah dicatat; koreksi operasional harus dilakukan oleh staf berwenang lewat workflow yang benar, bukan SQL manual.
