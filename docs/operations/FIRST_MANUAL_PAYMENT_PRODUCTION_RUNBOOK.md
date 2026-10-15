# Sprint 2G — Runbook verifikasi pembayaran transfer manual pertama (Production)

**Status:** operasional / pemeriksaan baca-saja; bukan bukti bahwa dana diterima.  
**Hosting tunggal:** Vercel (`https://gheverhan.vercel.app`)  
**Database & Storage:** Supabase project `bztprltkevacidcpjaam`  
**Basis release:** Sprint 2E/2F pada `main`; Sprint 2F merge commit `678ad97b2f5dae12d608add1637c653a2d62c4d2`.

## Tujuan dan batas aman

Pastikan pengajuan bukti pembayaran **yang benar-benar dikirim pembeli** bisa diterima aplikasi, direkonsiliasi terhadap catatan Storage privat, diverifikasi oleh Admin/Finance, dan menghasilkan transisi order/inventori yang benar.

- **Jangan membuat pembayaran fiktif**, mengirim bukti yang bukan transaksi nyata, mengonfirmasi penerimaan uang yang belum diverifikasi di mutasi rekening, ataupun mengubah order pelanggan tanpa alasan bisnis.
- **Jangan mengunggah/mengunduh bukti pembayaran ke alat publik, issue GitHub, chat, atau sistem analitik.** Jangan tampilkan PII seperti nama pengirim, nomor rekening, alamat, atau path privat dalam laporan.
- **Jangan mengambil service-role key Supabase dari Vercel**, memublikasikannya sebagai `NEXT_PUBLIC_*`, atau membuka bucket `payment-proofs` menjadi Public.
- Jalankan pemeriksaan SQL di bawah **SELECT only**. Tidak boleh mengubah tabel `Payment`, `Order`, `PaymentConfirmation`, `Inventory`, atau `storage.objects` secara manual.
- Tindakan **Setujui** dan **Tolak** harus dilakukan staf berizin `payment.verify` melalui aplikasi sesudah pemeriksaan yang semestinya. Pemantauan otomatis hanya memberi notifikasi; **tidak melakukan approval**.

## 1. Sebelum bukti pertama masuk

1. Pastikan `https://gheverhan.vercel.app` dapat dibuka; cek **Vercel Deployment** terakhir berstatus READY dan commit sesuai `main`.
2. Akses `/admin/payments` sebagai Admin/Finance dengan izin `payment.read`. Jika belum ada bukti baru, daftar seharusnya kosong.
3. Pastikan `payment-proofs` berstatus **Private** dan `product-images` berstatus Public di Supabase Storage. Batas aplikasi untuk file bukti adalah **4 MiB (4.194.304 byte)**; bucket memiliki batas atas 5 MiB.
4. Pemeriksa Finance wajib memiliki akses ke rekening tujuan yang sah melalui saluran bank resmi, dan boleh memeriksa mutasi dana. Informasi rekening dan bukti privat jangan dicatat dalam laporan publik.

## 2. Saat pelanggan mengirim bukti transfer asli

1. Pembeli yang telah melakukan transfer secara nyata masuk ke `/checkout/payment/[orderId]` miliknya, lalu mengisi detail transfer dan mengunggah **satu** JPG/PNG/WebP/PDF (maksimal 4 MiB).
2. Jika berhasil, status pembayaran menjadi `WAITING_VERIFICATION`. Pembeli tidak boleh dapat mengunggah ulang selama status tersebut; API harus menolak percobaan ulang dengan HTTP **409**.
3. Admin/Finance membuka **`https://gheverhan.vercel.app/admin/payments`**, melihat antrian dan membuka bukti privat melalui link berizin. Pastikan tidak ada error 403/404/5xx untuk Admin berizin.
4. Staf yang bukan pemilik order dan tidak memiliki izin membaca pembayaran **tidak boleh** dapat mengakses bukti. URL `/storage/v1/object/public/payment-proofs/...` tidak boleh mengekspos file.
5. *Bukti transfer yang terlihat jelas bukan kepastian dana masuk.* Bandingkan jumlah tagihan, nama/bank pengirim, rekening tujuan, tanggal transfer, dan transaksi **yang benar-benar tercatat pada mutasi bank**.
6. Jika tidak cocok / dana belum dikonfirmasi, **jangan setujui**. Pilih *Tolak pembayaran* dengan alasan yang bisa dipahami pelanggan bila memang terbukti tidak valid, atau lakukan investigasi sesuai kebijakan layanan. Setelah `REJECTED`, pembeli boleh mengunggah satu bukti baru jika pesanan belum kedaluwarsa.
7. Bila dana sudah dipastikan diterima dan order masih sah (belum kedaluwarsa/dibatalkan), klik **Setujui pembayaran**, cek konfirmasi, lalu verifikasi status menjadi `PAID`.
8. Pastikan tidak ada pengurangan stok berulang bila Admin tanpa sengaja menekan approval dua kali. Inventori harus mengubah reservasi menjadi penjualan **sekali**.
9. Catat hasil operasional secara internal hanya dengan ID/order reference yang diperlukan (tanpa konten bukti atau data perbankan); pertahankan jejak audit dan bukti asli sesuai kebijakan retensi.

## 3. Reconciliation SQL aman (baca-saja)

Jalankan secara manual di Supabase SQL Editor **tanpa mengunggah hasil berisi PII ke luar**. Query ini mengembalikan angka agregat, bukan nama pelanggan, order ID, atau bukti.

```sql
-- Ringkasan status pembayaran/order/konfirmasi; tidak berisi identitas pembeli.
SELECT
  (SELECT COUNT(*) FROM public."Order")::int AS order_count,
  (SELECT COUNT(*) FROM public."Payment")::int AS payment_count,
  (SELECT COUNT(*) FROM public."PaymentConfirmation")::int AS proof_submission_count,
  (SELECT COUNT(*) FROM public."Payment" WHERE status='WAITING_VERIFICATION')::int AS waiting_verification_count,
  (SELECT COUNT(*) FROM public."Payment" WHERE status='REJECTED')::int AS rejected_payment_count,
  (SELECT COUNT(*) FROM public."Payment" WHERE status='PAID')::int AS paid_payment_count,
  (SELECT COUNT(*) FROM storage.objects
    WHERE bucket_id='payment-proofs' AND name<>'.emptyFolderPlaceholder')::int AS private_proof_objects;
```

```sql
-- Rekonsiliasi: bukti DB harus merujuk objek di bucket privat.
SELECT COUNT(*)::int AS missing_storage_proofs
FROM public."PaymentConfirmation" c
WHERE NOT EXISTS (
  SELECT 1 FROM storage.objects o
  WHERE o.bucket_id='payment-proofs' AND o.name=c."proofPath"
);
```

```sql
-- Rekonsiliasi: status PAID harus sinkron dengan Order & mempunyai approval.
SELECT COUNT(*)::int AS paid_state_mismatches
FROM public."Payment" p
JOIN public."Order" o ON o.id=p."orderId"
WHERE p.status='PAID'
  AND (
    o.status NOT IN ('PAID','PROCESSING','PACKED','SHIPPED','DELIVERED')
    OR o."paymentStatus"<>'PAID'
    OR NOT EXISTS (
      SELECT 1 FROM public."PaymentConfirmation" c
      WHERE c."paymentId"=p.id AND c.status='APPROVED'
    )
  );
```

```sql
-- Antri verifikasi yang tidak mempunyai bukti aktif yang diajukan.
SELECT COUNT(*)::int AS verification_without_submission
FROM public."Payment" p
WHERE p.status='WAITING_VERIFICATION'
  AND NOT EXISTS (
    SELECT 1 FROM public."PaymentConfirmation" c
    WHERE c."paymentId"=p.id AND c.status='SUBMITTED'
  );
```

**Interpretasi:** `missing_storage_proofs`, `paid_state_mismatches`, dan `verification_without_submission` diharapkan **0**. Jika tidak 0, hentikan approval terkait, investigasi log/auth secara internal, dan catat insiden. `private_proof_objects` dapat lebih besar daripada jumlah bukti DB jika ada orphan akibat kompensasi gagal; jangan menghapusnya tanpa audit karena bisa merupakan bukti sengketa.

## 4. Hasil yang harus dibuktikan dan batasan pengujian

| Bukti | Kondisi diterima |
| --- | --- |
| HTTP upload via Vercel | File asli valid diterima, error ditampilkan jika tidak valid |
| DB | Satu submission baru, Payment = WAITING_VERIFICATION |
| Supabase private Storage | Ada objek untuk `proofPath`, bucket tetap Private |
| Access control | Hanya pemilik order dan staf berizin yang bisa membaca bukti |
| Duplicate guard | Upload kedua saat menunggu mendapat 409, tanpa object kedua |
| Approval manual | Dana telah dicocokkan dengan mutasi bank, Order dan Payment sinkron |
| Stock/audit | Perubahan stok/SALE terjadi sekali; aktivitas tercatat |
| Rejection/resubmit | Alasan penolakan tersimpan, pelanggan bisa mengirim ulang selama order valid |

**Jangan** sengaja melakukan transfer uang palsu atau membuat order `PAID` hanya untuk mengisi semua checklist. Jika belum ada transaksi asli, hasil validasi production adalah **pending**; gunakan hasil automated isolated test untuk kualitas kode.

## 5. Jika gagal

- **Upload 413/5xx**: catat timestamp serta request ID aman (tanpa isi file). Periksa konfigurasi 4 MiB dan Vercel Function logs menggunakan akses tim.
- **Tidak ada objek tapi DB ada**: hentikan pemrosesan terkait; periksa adapter Storage, event log, dan fungsi kompensasi.
- **Bukti bisa diakses anonim**: insiden keamanan; segera tangani bucket RLS/akses dan batasi paparan, jangan melanjutkan release.
- **Order expired tetapi ada laporan dana masuk**: jangan langsung menyetujui order yang tertutup. Verifikasi dana melalui bank dan jalankan proses pemulihan/refund sesuai kebijakan perusahaan.
- **Kegagalan besar pada release**: deployment stabil terakhir sebelum Sprint 2F adalah **`dpl_2CHHL3aN4hui42jREwzKWGCiPrCR`** (commit `1dc4362`). Rollback lewat Vercel setelah konfirmasi insiden; rollback deployment **tidak otomatis menghapus/membatalkan transaksi** di database.

## 6. Definisi selesai

Tandai validasi operasional **PASS** hanya setelah ada satu bukti pembayaran **asli** yang memenuhi aturan akses/rekonsiliasi dan keputusan verifikasi bank yang sah. Jika pelanggan belum mengirim bukti, gunakan status **Waiting for first real proof**—bukan FAIL dan bukan PASS.
