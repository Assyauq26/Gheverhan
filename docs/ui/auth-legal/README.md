# Gheverhan — Auth UI dan halaman legal

Baseline: main `d5882c88fa9cc398b2a1cb458b502a2c92cf382b` (hasil PR65), diperiksa18 Oktober2026. Branch `feat/auth-ui-legal-pages`. WIP lama `/workspace/Gheverhan` tidak diubah. Tidak merge/deploy production, mengubah database/credential/env live, atau membuat staging. Build branch ini dinonaktifkan di source Vercel agar PR tidak memicu Preview yang memakai resource bersama.

## Audit awal dan perubahan

Next15.5.28, React18.3.1, TypeScript5.6.3, Tailwind3.4.19, npm lockfile. Auth memakai Server Actions langsung, JWT/sessionVersion/revocation dan guard database/RLS. Email wajib saat register, nomor HP opsional. Social auth belum ada. Halaman legal sebelumnya belum tersedia. Footer berada dalam layout storefront. Aset brand sebelumnya memakai ikon Chrome/chat umum.

- Layout auth dibuat putih, tanpa sidebar/ilustrasi, wordmark tengah dan form464px. Desktop heading tengah, mobile rata kiri dengan gutter24px; input/submit44px dan social dua kolom→vertikal.
- Reusable Field/Submit/Heading/Feedback; label terhubung, autocomplete, toggle mata dengan aria-pressed, feedback backend/live region, pending disabled/aria-busy. Field lokal terkontrol mempertahankan input setelah Server Action mengembalikan error, tanpa localStorage/password persistence.
- Nama field dan semua data-testid auth lama dipertahankan. Actions/service/Prisma/API/session tidak diubah. Terms tetap diwajibkan browser dan server. Link legal tab baru noopener/noreferrer, di luar label checkbox, tidak mencentang consent atau membuang input.
- Google G dari aset resmi Google dan WhatsApp glyph resmi merek melalui Simple Icons, SVG lokal; tidak memakai Chrome atau generic chat. Tombol disabled, tidak membuat callback/session/provider palsu; penjelasan Segera hadir tetap terlihat. Lihat `frontend/public/brands/NOTICE.md`.
- Lumen MCP meta/rules/tokens/contracts diperiksa. Semua rilis adapter React yang diperiksa membutuhkan React>=19;4.1 juga motion14. Memaksa peer atau upgrade React tidak dipilih. Subset registry Lumen4.1 (Button/Input/Label/Checkbox/Icon) dengan adaptasi forwardRef React18 dan CSS asli yang di-scope dipakai hanya pada auth. Lisensi/provenance dan hash stylesheet upstream disertakan. Tidak menambah dependency atau mengubah lockfile. CSS sekali di auth layout; tidak ada global reset baru atau override globals.css.
- `/syarat-ketentuan` dan `/kebijakan-privasi`: Server Components publik, masing-masing19 bagian, daftar isi, tanggal18 Oktober2026, canonical `https://gheverhan.store/...`, metadata deskriptif dan noindex selama draft. Footer storefront menautkan keduanya.

## Konten dummy dan rencana editor admin

Sesuai arahan pemilik, kebijakan retur dan retensi berisi contoh/dummy yang diberi label, bukan kebijakan resmi. Profile/metadata/section headings dan body terpisah di `frontend/src/config/legal.ts`. Tidak mengarang kontak, nama PT/CV, alamat, SLA atau kepatuhan yang dijamin. Contoh7hari retur/2tahun transaksi/90hari proof tidak mengaktifkan jadwal/hapus otomatis atau fitur baru. Keputusan resmi tetap memerlukan review pemilik.

Editor dashboard admin **belum diimplementasikan** karena arahan menyebut nanti dan task ini melarang perubahan backend/database. Struktur konten disiapkan agar tahap berikutnya dapat mengganti sumber data. Editor berikutnya memerlukan storage yang disetujui, RBAC khusus, validasi plain text, audit/perubahan, pemisahan draft/published, preview, revalidation dan tanggal/version semantics. Jangan menyimpan consent versi dokumen secara semu; backend saat ini belum memilikinya. Renderer sekarang meng-escape teks, tanpa dangerouslySetInnerHTML. Mengubah config sekarang memerlukan review source/build; belum bisa diedit melalui dashboard.

## Validasi dan bukti

Node22.22.0, PostgreSQL17.11 disposable sendiri di127.0.0.1:55439, database `gheverhan_sprint1_test`; tidak menyalin .env/credential/data production. Email sungguhan dinonaktifkan. Browser memakai Chromium153.0.8010.12, local production build. Unit suite dalam Docker read-only/network-none/cap-drop/uid1000 dengan resource limits.

- TypeScript, ESLint dan production build PASS sebelum freeze; CI mengulang pada HEAD PR.
- Full236 unit (3UI baru),25 containment dan9mitigation PASS;12 auth PostgreSQL PASS.
- Browser9 kelompok scenario PASS:8viewports; link legal/form preservation; terms client+server; toggle/pending/double-submit; duplicate email; logout/login gagal+berhasil/redirect; forgot validation/config unavailable; invalid/expired/used reset token+revoked old-session browser redirect; anonymous legal/metadata/footer.
- CI integration ditambah langkah auth-ui-browser, screenshot/JSON per SHA, tanpa melemahkan gate lama. Gate product/cart, operations/payment, PG, hydration dan navigasi10×44 tetap dijalankan. Hasil final dan link CI pada deskripsi PR; hasil lama tidak diklaim sebagai hasil final SHA baru.
- Viewport360×800,375×812,390×844,430×932,768×1024,1024×768,1440×900,1920×1080. Capture32 halaman after di semua viewport tidak mengalami horizontal overflow/page error;9group flow juga nol console/page errors.

RCA selama pengerjaan: (1) selector toggle yang masih memakai accessible name lama setelah toggle diganti agar mengikuti nama baru; (2) reset native form saat action gagal diperbaiki dengan state Field lokal; (3) fixture UUID reset diganti token64hex sesuai kontrak, bukan melonggarkan validasi; (4) redirect Next streaming diverifikasi lewat browser dengan cookie lama yang benar, bukan menganggap semua redirect harus HTTP307. Semua kasus diulang; test gagal tidak dihapus atau dilewati.

## Perbandingan visual yang benar-benar dilakukan

Empat surface mockup di chat dibandingkan secara visual dengan screenshot login/register390 dan1440. Geometri produksi diukur pada16 kombinasi route/viewport: input dan submit44px; form mobile lebar viewport−48px dan desktop464px; Google lebih dulu, WhatsApp di bawah pada mobile dan sejajar desktop; wordmark/heading/alignment diverifikasi. File visual-geometry.json menyimpan ukuran terukur.

| Aspek | Referensi dan hasil |
|---|---|
| Komposisi | Putih, satu form, wordmark tengah, tanpa frame device/status bar/hero tambahan |
| Desktop | Form terpusat, heading/deskripsi tengah, social berdampingan lebih lebar daripada form |
| Mobile | Heading kiri, gutter konsisten, input/tombol full width dan social vertikal |
| Detail | Border tipis, radius lembut, tombol hitam tanpa shadow besar, ikon outline/brand dan panah |
| Interaksi | Toggle/pending/error/focus/terms dan link legal berfungsi |

Perbedaan disengaja: email register jelas wajib, nomor HP opsional dalam disclosure; keterangan Segera hadir terlihat; consent default unchecked; dokumen legal berlabel dummy/draft. Ini mempertahankan kontrak dan kejelasan produk. Tidak mengklaim angka90% atau pixel-perfect sebagai hasil pengukuran: referensi berupa komposit mockup/device dengan skala berbeda, bukan baseline browser setara untuk pixel diff. Screenshot dan ukuran nyata disediakan agar pemilik menilai fidelity; tidak memakai persentase subjektif sebagai bukti.

First-load JS login/register pada build lokal117kB→116kB (pembulatan output Next); legal106kB. Bukan benchmark performance atau klaim seluruh runtime lebih cepat.

## Screenshot

| Surface | Before | After |
|---|---|---|
| Desktop login | [1440](before/login-1440.png) | [1440](after/login-1440.png) |
| Mobile login | [390](before/login-390.png) | [390](after/login-390.png) |
| Desktop register | [1440](before/register-1440.png) | [1440](after/register-1440.png) |
| Mobile register | [390](before/register-390.png) | [390](after/register-390.png) |
| Syarat & Ketentuan | Belum ada | [Desktop](after/syarat-ketentuan-1440.png), [Mobile](after/syarat-ketentuan-390.png) |
| Kebijakan Privasi | Belum ada | [Desktop](after/kebijakan-privasi-1440.png), [Mobile](after/kebijakan-privasi-390.png) |

Seluruh32 screenshot after dan16 before tersedia di workspace `/workspace/scratch/auth-ui/evidence`; CI mempertahankan screenshot/JSON dummy selama7hari sesuai workflow. Tidak menyimpan cookie/storageState/token/trace browser sebagai artifact. Risiko residual: belum ada editor admin, review legal/identitas/kontak operasional belum disahkan, social auth nonaktif, belum ada visual diff lintas-engine Safari/Firefox. Jangan merge/deploy sampai hasil UI dan legal direview pemilik.
