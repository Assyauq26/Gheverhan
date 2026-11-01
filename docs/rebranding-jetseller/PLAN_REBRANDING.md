# MASTER PLAN — Rebranding Gheverhan menjadi JetSeller Demo Store

**ID:** JSD-REB-001  
**Status:** RENCANA / belum dieksekusi  
**Baseline yang diperiksa:** repository `Assyauq26/Gheverhan`, `main` = `9f97384f466151c45bc91ca944797864fe60a3ad` (1 November 2026); lakukan audit ulang sebelum eksekusi karena kode bisa berubah.  
**Sumber keputusan:** permintaan owner mengubah semua branding yang tampak dari Gheverhan menjadi JetSeller, latar putih, aksen merah J&T, wordmark JetSeller, toko Gheverhan dijadikan demo utama, dan pada fase terpisah rename repository menjadi JetSeller + Private.

## 0. Keputusan produk / kontrak hasil

| Area | Keputusan | Perubahan sekarang? |
| --- | --- | --- |
| Platform pemasaran | `jetseller.web.id` tetap landing page JetSeller | Tidak didesain ulang |
| Storefront demo | Toko di `gheverhan.store` diberi identitas **JetSeller** dan penjelas **Demo Store** pada tempat yang sesuai | Ya, refactor visual |
| Dashboard seller demo | `gheverhan.store/admin` menjadi dashboard berbrand JetSeller, hak akses/flow lama utuh | Ya, hanya UI/copy |
| Kode utama | Satu repository dan satu aplikasi Next.js yang ada; jangan membuat duplikat app | Ya, perubahan source terkontrol |
| Domain toko demo | `gheverhan.store` tetap digunakan selama tahap rebrand | Jangan pindah DNS sekarang |
| Domain demo baru | `demo.jetseller.web.id` hanya rencana migrasi berikutnya | Tidak |
| Super Admin platform | `dashboard.jetseller.web.id` masih scope proyek platform lain | Tidak |
| GitHub | Target masa depan `Assyauq26/JetSeller` dengan visibility **Private** | Fase akhir, gating terpisah |
| Skema database | Prisma dan data existing tetap | Tidak |
| J&T shipping | Integrasi official yang ada tidak disentuh/diaktifkan hanya karena rebrand | Tidak |
| Publikasi | Merge, deploy image, publish tema, update repo metadata adalah langkah berbeda | Wajib dipisah |

**Definisi selesai:** pengunjung dan admin demo melihat JetSeller konsisten di UI/metadata/email yang berlaku, putih dominan dan merah primer, tanpa tulisan Gheverhan yang tersisa pada *public-facing surfaces*, kecuali domain lama yang disadari serta catatan historis/legal yang belum berwenang diubah. Seluruh alur bisnis lulus. Repo belum otomatis diganti nama/private pada gelombang UI.

### 0.1 Arsitektur brand

- **JetSeller Platform:** layanan SaaS penyedia toko online; landing `jetseller.web.id`.
- **JetSeller Demo Store:** contoh toko nyata dari platform; menggunakan app ecommerce Gheverhan yang sudah dibangun. Gunakan wordmark `JetSeller` pada storefront dan admin, dengan penanda `Demo Store` yang kecil/terpisah jika dibutuhkan agar tidak disalahartikan sebagai layanan platform atau seller pelanggan.
- Jangan menyebut aplikasi demo sebagai marketplace multi-tenant yang sudah siap apabila provisioning seller belum nyata.
- Jangan mengganti nama historis legal/identitas penjual dalam faktur/rekaman order tanpa dasar hukum serta persetujuan tersendiri.
- Pendaftaran **pelanggan** pada demo tetap berbeda dari pendaftaran **seller platform** pada JetSeller landing. Tidak boleh salah route.
- Jangan menghapus produk contoh, akun demo yang berizin, stok, transaksi, ulasan, atau data historis.

### 0.2 Spesifikasi desain wajib

| Token desain | Nilai target | Catatan |
| --- | --- | --- |
| Primary | `#E1251B` | Merah JetSeller yang kini digunakan landing; evaluasi AA |
| Primary hover | `#B3121A` | Kontras tombol |
| Page Background | `#FFFFFF` | Latar utama putih |
| Surface | `#F7F7F8` | Area pendukung |
| Card | `#FFFFFF` | Minim border |
| Text | `#111418` | Hitam lembut |
| Text muted | `#667085` | Pastikan kontras AA |
| Primary foreground | `#FFFFFF` | Pada tombol merah |
| Focus | Kontras tinggi sesuai WCAG | Tidak mengandalkan warna saja |

Aturan UI: responsive mobile-first; visual bersih, rounded terkendali, tanpa border tebal, CTA utama merah, navbar mobile floating pill sesuai desain existing, wishlist dan CTA produk tetap, ikon Lucide konsisten, harga diskon tetap mudah terbaca. Hindari glassmorphism berlebihan, motion berlebihan, pergantian layout besar yang tidak diminta. Perubahan token produk, header/footer, modal, form, checkout, admin dan auth harus konsisten.

**Logo:** gunakan wordmark bertuliskan **JetSeller** sesuai branding landing yang telah ada; boleh gunakan elemen vektor/teks terlisensi sendiri. Jangan mengambil logo J&T resmi dari sumber lain tanpa izin. Bila asset final belum tersedia, fallback wordmark teks JetSeller yang valid di desktop/mobile. Simpan sumber aset dan periksa sanitasi SVG. Favicon dan OG asset konsisten dengan identitas baru.

**Copy:** `JetSeller` adalah nama brand; `JetSeller Demo Store` saat label demo diperlukan. Jangan mengubah klaim bisnis/biaya/sistem pengiriman tanpa bukti. Hapus klaim berlebihan seperti jumlah pelanggan yang tidak terverifikasi (misalnya placeholder testimonial/statistik) bila tidak didukung fakta; tidak perlu menghapus komponen trust yang valid.

## 1. Audit nyata yang wajib dikerjakan Codex sebelum coding

1. Sinkronkan `main`, dokumentasikan HEAD, pastikan worktree bersih; cek PR yang sedang dikerjakan orang lain; gunakan branch refactor sendiri.
2. Ambil screenshot *baseline* storefront desktop/mobile, login/OTP, cart, checkout, dashboard admin, halaman legal dan email preview jika tersedia. Jangan menyebut screenshot lokal sebagai production.
3. Buat inventaris hasil `rg -n -i "gheverhan|better outfits|jet.?seller|#111111|#e1251b" frontend landing deploy .github`; klasifikasi setiap match:
   - **A — user-facing**: logo, title, navigation, admin, email, metadata, OpenGraph, favicon, legal copy yang boleh diubah.
   - **B — appearance-data**: published draft/theme/asset logo dan revisi pada `StoreAppearance`.
   - **C — technical compatibility**: JWT, env, Docker image/service, path VPS, database, cron, URL origin/callback, origin checks, cookie/session. **Tidak diganti dalam PR visual.**
   - **D — historical evidence**: migrations, changelog, audit lama, dokumentasi release lampau, snapshots, checksum. **Pertahankan.**
   - **E — tests/fixtures**: update ekspektasi tampilan hanya bila behavior yang diuji berubah; jangan ubah bukti historis.
4. Audit pengaturan tema publik dan izin publish. Saat baseline, `frontend/src/modules/appearance/schema.ts` memiliki `makeDefault()` dan `legacyDefault()` yang mengandung Gheverhan; `frontend/src/modules/appearance/service.ts` menyimpan `draft` dan `published` pada `StoreAppearance` serta riwayat versi; `frontend/src/modules/appearance/published.ts` memakai cache; `frontend/src/modules/appearance/runtime.ts` memakai `isLegacy()` dan `themeStyle()`.
5. Audit per-tenant assumption: kode lama masih satu demo store. Jangan membuat skema multi-tenant/provisioning dalam task ini.
6. Audit `frontend/src/app/layout.tsx`, `frontend/src/app/(storefront)/layout.tsx`, `frontend/src/app/(auth)/layout.tsx`, `frontend/src/app/(legal)/layout.tsx`, `frontend/src/app/admin/layout.tsx`, `frontend/src/app/icon.svg`, `frontend/src/components/storefront/header.tsx`, `frontend/src/components/appearance/context.tsx`.
7. Audit komponen downstream: seluruh `frontend/src/components/storefront`, dashboard admin, template email transaksi/OTP, halaman user/account, checkout, invoice/nota jika mengandung branding, PDF bila ada, consent/privacy/terms, structured data dan OG.
8. Audit deployment JetSeller vs demo: `landing/jetseller` adalah static landing Caddy, demo ecommerce di Next.js melalui proxy VPS. Jangan satukan kedua host/overwrite static landing.
9. Audit `.github/workflows/*` dan `deploy/helipod/*`; deployment prod saat baseline dijaga `HELI_POD_AUTODEPLOY`. Pastikan nilai runtime yang sebenarnya dengan akses operator; jangan mengasumsikan sudah enabled atau disabled tanpa bukti.
10. Audit koneksi ke GitHub, Codex dan pull/clone VPS; buat daftar URL/hardcode `Assyauq26/Gheverhan`, termasuk script GitHub REST dan script raw static.

**Deliverable Phase 0:** `docs/rebranding-jetseller/reports/01-baseline-audit.md` pada PR implementasi berisi tabel A–E, risiko, screenshots referensi, status aktif demo & landing (verified/unverified), review akses, dan keputusan scope. Jangan membocorkan secret, email pengguna, token, atau data pelanggan.

## 2. Fase A — UI/UX dan identitas publik (tanpa migrasi)

**Branch terpisah:** `feat/jetseller-demo-brand-ui` (atau nama unik jika telah ada).

### A1 — Brand tokens dan appearance engine

- Pertahankan shape schema Appearance v1 dan semua 53 token/toggle yang ada; tidak membuat field wajib baru hanya untuk tema.
- Terapkan palet merah-putih JetSeller pada **preset demo baru** atau mekanisme yang aman berdasarkan desain existing.
- **Jangan** menimpa `legacyDefault()` jika merupakan compatibility baseline bagi `isLegacy`/history/migrasi. Jika mengubah `makeDefault()` berdampak pada reset dan test existing, lakukan audit call-sites dan sediakan legacy fixture yang stabil.
- Jangan mengasumsikan perbaikan default source otomatis menimpa row `StoreAppearance.published`. Jika row published saat ini bernama Gheverhan, diperlukan **publikasi eksplisit** (lihat fase B). Jangan melakukan silent database update dalam startup.
- Jika published logo mengarah `logoAssetId` lama, siapkan asset JetSeller melalui mekanisme resmi `StoreBrandAsset` dan jalur publish yang diotorisasi. Hindari upload asset tidak aman dan perubahan ID manual.
- Pastikan token CSS untuk tombol, badge, harga, active nav, fokus, checkout, modal, dan form berfungsi pada tema published. Periksa `contrastErrors` dan WCAG AA.
- Jangan mengubah authorisasi publish/rollback, rate limit, atau bypass session/actor verification.

### A2 — Storefront buyer demo

- Header logo JetSeller, caption Demo Store bila membantu, favicon, footer copyright, hero/fallback visual, badge dan navigasi.
- Halaman home, shop, list/detail produk, variasi, keranjang, checkout, wishlist, akun, review, order history, notifikasi/empty/loading/errors.
- Hindari merusak harga reguler/diskon, flash sale, stok, pilihan variasi, sticky PDP CTA, floating bottom nav, login/account, checkout.
- Jangan mengubah produk atau foto historis yang memang berbrand Gheverhan secara massal; inventarisasi lalu tandai konten editorial yang perlu diunggah ulang dengan hak penggunaan yang benar.
- Aksesibilitas: logo memiliki accessible name, focus ring kontras, error text jelas.

### A3 — Dashboard admin seller demo

- Sidebar dan header desktop/mobile: label JetSeller; tombol menuju toko bernama JetSeller Demo Store, fallback initials tidak lagi `GH` apabila itu label brand, tapi initials pengguna tetap berbasis user.
- Konsistensi warna merah aktif pada navigasi dan tombol primer, putih dominan, tabel/chart/form tetap jelas, state disabled/destructive tetap berbeda.
- Jangan menyentuh RBAC, izin platform J&T, fitur admin integrations, voucher, produk, pengiriman, pembayaran, pelaporan.
- Jangan memasukkan dashboard Super Admin SaaS baru ke app demo (target masa depan `dashboard.jetseller.web.id` terpisah).

### A4 — Auth, legal, email & SEO

- Login/registrasi pelanggan/email OTP/forgot password/customer transactional emails yang memang menampilkan nama brand diganti menjadi JetSeller.
- Legal: revisi **nama dagang/brand** pada bagian yang boleh diubah; informasi pengelola berbadan hukum, pihak kontrak, privasi, pemroses data, atau referensi historis tidak boleh diganti sembarangan. Tandai peninjauan legal.
- `metadata`, OpenGraph/Twitter, canonical, sitemap/robots, JSON-LD yang user-visible, favicon, title, alt text (jangan menjadikan alt sebagai SEO keyword stuffing).
- Pastikan `metadataBase` tetap menunjuk domain aktual dari konfigurasi env; jangan memaksa domain JetSeller platform pada demo domain.
- Email domain/sender/from tidak otomatis berubah tanpa verifikasi domain dan DNS Resend; hanya copy branding sesuai izin.

### A5 — Konsistensi dengan landing

- Selaraskan warna, tipografi, wordmark dengan `landing/jetseller` sebagai referensi visual. Jangan mendesain ulang landing di task ini.
- Tetapkan tombol **Lihat Demo** pada landing tetap menuju `https://gheverhan.store` sampai domain demo baru verified dan approved.
- Jangan menambahkan login/registrasi seller palsu, atau mengarahkan CTA daftar seller ke register customer.

**Deliverable A:** screenshots desktop/mobile, daftar file perubahan, documented non-goals, evidence QA. **Tidak ada deploy dari PR A.**

## 3. Fase B — Published appearance + release VPS (GATE PRODUKSI)

Bukan bagian otomatis dari perubahan source. Lakukan setelah persetujuan owner untuk commit release tertentu dan akses operator VPS tersedia.

### B0. Preflight / backup

- Tetapkan commit PR A yang telah merged, bukti CI, pemeriksaan kontrak keamanan, status services/health, risiko rollout, dan siapa operator.
- Backup & verifikasi pemulihan: data `StoreAppearance` (draft, published, versi, revision history, logo/asset references), database sesuai kebijakan yang aman, file media yang dirujuk, image/tag saat ini, dan deploy source/release manifest.
- Pastikan tidak ada deployment bersamaan; gunakan lock yang ada dan mekanisme rollback yang diuji.
- Pertahankan `gheverhan.store`, `jetseller.web.id`, DNS, Caddy host, proxy dan domain callback.
- Jangan membuat backup dengan mengirim data pribadi atau kredensial ke GitHub issue/PR.

### B1. Source deployment

- Deploy aplikasi Next.js hanya melalui jalur VPS yang benar-benar diberi izin. Saat audit sebelumnya, GitHub SSH key restricted dapat hanya menerima aliran Docker image, **bukan shell/SCP**. Jangan memaksa/menonaktifkan forced-command.
- Jangan ubah `HELI_POD_AUTODEPLOY` untuk task rebrand tanpa persetujuan eksplisit.
- Tidak ada Prisma migration, seed, truncate, reset, atau replacement database untuk rebranding visual.
- Pastikan server baru sehat sebelum switch/restart yang disetujui; ukur downtime dan error.

### B2. Appearance publishing

- Gunakan prosedur **admin Customize Store save draft → preview → publish** yang sudah ada atau prosedur terotorisasi dan diaudit. Jangan update kolom published langsung, sebab harus menghormati version, validation, actor, audit, rollback dan cache invalidation.
- Kalau identitas dan logo existing tetap Gheverhan karena published DB belum berubah, status release **BELUM COMPLETE**, meskipun source deploy sukses.
- Catat publishedVersion, revision sebelum dan sesudah serta path aset logo. Bukti pass kontras dan visual di host asli.
- Uji cache refresh/revalidate dan invalidation dari `getPublishedAppearance()`.

### B3. Smoke production

- `https://gheverhan.store`: status, new branding, favicon, metadata, header/footer, store/product/PDP/cart, login/logout, OTP tanpa mengirim ke pengguna sesungguhnya, checkout smoke aman (test order only if authorized), admin dashboard dan Customize.
- `https://jetseller.web.id`: status 200, branding landing tetap, **Lihat Demo → gheverhan.store**.
- J&T hanya health/config read-only; jangan memesan AWB sungguhan dalam smoke tanpa izin dan data uji yang sah.
- Monitor 4xx/5xx/hydration/performance; dokumentasikan before/after dan log tanpa PII.

### B4. Rollback

- Rollback source/image ke versi sebelumnya jika ada error aplikasi.
- Rollback published appearance memakai **revision history** terverifikasi melalui jalur admin yang sah, dengan verifikasi version dan cache; tidak cukup rollback kode saja.
- Rollback assets logo bila dirujuk sesuai versi. Jangan hapus aset lama sebelum rollback window selesai.
- Periksa health kedua host setelah rollback.
- Catat owner, waktu, SHA dan verdict `LIVE_VERIFIED` / `BLOCKED` / `ROLLED_BACK`; tidak boleh klaim LIVE hanya dari merge CI.

## 4. Fase C — Rename repository + Private (GATE OPERASIONAL TERPISAH)

**Tujuan akhir** `github.com/Assyauq26/JetSeller`, visibility `Private`. Repo saat baseline masih `Assyauq26/Gheverhan`, visibility `Public`. Owner memberi intent produk, **tetapi perubahan administratif destruktif/akses harus menunggu persetujuan tahap C sesudah evidence**.

### C0. Dependency mapping dan kontrol akses

- Inventaris semua references: GitHub remote URL, Actions YAML, JS/Python hardcoded `api.github.com/repos/Assyauq26/Gheverhan`, raw GitHub assets, VPS `/opt/gheverhan/source` Git remote, Codex workspace, CI/cross-repo triggers, tokens, webhooks, GitHub App installations, branch protections/rulesets, CI statuses dan issue references.
- Telusuri khusus `landing/jetseller/deploy/release-v3-from-vps.sh` dan `landing/jetseller/deploy/RELEASE-V3.md`: pemakaian `raw.githubusercontent.com/Assyauq26/Gheverhan` **akan gagal untuk akses anonymous setelah repo Private**. Migrasikan ke authenticated release artifact/deploy yang pinned + checksum, atau metode private git deploy-key yang disetujui; tes dari VPS lebih dahulu.
- Audit `.github/scripts/gheverhan-final-release-gate.mjs` dan skrip CI lain yang hardcode repo REST name.
- Pastikan koneksi GitHub App ChatGPT/Codex dan akun reviewer memiliki akses ke repo Private; cakupan instalasi GitHub App bisa perlu disetujui kembali.
- Inventaris GitHub secrets/vars/environment rules, `HELI_POD_AUTODEPLOY` (tanpa membaca nilai secret), deploy keys, action permissions dalam private repository serta ketersediaan Actions pada paket akun.
- Sebelum rename, sediakan backup git/refs yang berizin dan rollback operasional, daftar dependensi yang sign-off.

### C1. Prosedur rename yang diusulkan (jangan otomatis dieksekusi oleh Codex)

1. Bekukan sementara deploy & commit concurrency; pastikan pipeline green.
2. Pastikan target nama `Assyauq26/JetSeller` masih tersedia (periksa izin dan existing repo).
3. Gunakan GitHub repo Settings untuk rename. Catat repo ID dan URL baru; jangan bergantung pada redirect lama untuk operasi jangka panjang.
4. Reconnect Git remote pada workstation, Codex environment, VPS (dengan akses operator resmi), dan semua scripts/webhooks.
5. Verifikasi `git fetch`, `git ls-remote`, CI, PR, GH API, image/deploy mechanism, secrets/vars, protected branch, custom GitHub App integrations.
6. Pastikan jalur deployment untuk **private repo** berhasil dengan bukti read-only dan roll-forward/rollback rehearsal sebelum mengubah visibility.
7. Ubah repo menjadi Private melalui GitHub Settings saat owner mengizinkan; audit anggota, forks dan public mirrors. Menjadikan Private tidak otomatis menghapus salinan/fork yang sudah beredar.
8. Tes ulang pipeline & deploy source; jangan regenerate database atau memaksa secret reset tanpa investigasi.
9. Pertahankan kompatibilitas runtime nama teknis lama (paths/env, JWT) sampai migrasi teknis tersendiri terbukti.

### C2. Kriteria aman untuk repo Private

- GitHub/Codex dapat membaca source tanpa token dipajang di log.
- Branch protection/required checks tetap bekerja.
- Operator VPS punya jalur read-only mengambil release privat dan ada prosedur rollback.
- Runner CI bisa build dan tetap menerapkan deploy gated.
- Tidak ada URL public `raw.githubusercontent.com` yang menjadi dependency runtime yang wajib; semua penggunaan sudah diaudit.
- Domain demo dan landing tetap up (HTTPS), tidak ada redirect liar.
- Tidak ada konflik nama paket/image/status session akibat hanya rename repo.

**Jika salah satu gate gagal:** tetap Public dulu atau jalankan rollback yang disetujui; jangan mengganti visibility dalam keadaan deployment belum siap.

## 5. Daftar file prioritas untuk investigasi (bukan daftar replace otomatis)

| Area | File / folder audited baseline | Tujuan |
| --- | --- | --- |
| Store brand default | `frontend/src/modules/appearance/schema.ts` | identity, colors, defaults, legacy compatibility |
| Theme storage/publish | `frontend/src/modules/appearance/service.ts` | draft, published, audit, revisions |
| Read/cache theme | `frontend/src/modules/appearance/published.ts` | cache/fallback |
| CSS runtime theme | `frontend/src/modules/appearance/runtime.ts` | CSS vars dan isLegacy |
| Logo rendering | `frontend/src/components/appearance/context.tsx` | StoreLogo/text/image/fallback |
| Storefront header | `frontend/src/components/storefront/header.tsx` | logo, nav, buttons |
| Storefront layout/footer | `frontend/src/app/(storefront)/layout.tsx` | metadata, published theme, copyright |
| Root SEO | `frontend/src/app/layout.tsx` | title/meta fallback |
| Favicon | `frontend/src/app/icon.svg` | favicon lama G |
| Admin | `frontend/src/app/admin/layout.tsx` | sidebar, header, store name, initials fallback |
| Auth | `frontend/src/app/(auth)/layout.tsx` | login/register branding |
| Legal | `frontend/src/app/(legal)/layout.tsx` | legal branding |
| App styles | `frontend/src/app/globals.css` & komponen terkait | palette/focus/pill |
| Email & receipts | cari di `frontend/src` / `frontend/scripts` | subject/from/template brand & invoice |
| J&T official | `frontend/src/infrastructure/shipping/jnt` | DO NOT ALTER functionality |
| Login token compatibility | `frontend/src/lib/auth/jwt.ts` | **jangan rename issuer/audience** |
| VPS/infra | `deploy/helipod/*` | **jangan rename paths/keys** pada fase visual |
| JetSeller marketing | `landing/jetseller/*` | tetap landing terpisah; tautan demo |
| Repo migration | `.github/workflows/*` / `.github/scripts/*` | rename/private access only phase C |

Inventaris ini bukan daftar lengkap; Codex wajib melakukan pencarian sendiri untuk menemukan sisa public branding yang terlewat.

## 6. Testing dan acceptance gates

### Test lokal/CI (gunakan scripts existing; periksa package.json terbaru)

- `cd frontend && npm run security:verify`
- `cd frontend && npm run lint`
- `cd frontend && npm run typecheck`
- `cd frontend && npm test`
- `cd frontend && npm run build`
- Unit & integration spesifik Appearance/Customize, auth/OTP, shopping cart, pricing/checkout serta J&T boundaries.
- Browser responsive minimal 360 / 390 / 428 / 768 / 1024 / 1440 px, desktop & mobile.
- QA fokus: logo/brand konsisten, kontras, alt-text, reduced-motion jika berlaku, no overflows, no hydration, tombol/cart/PDP sticky, checkout, admin ACL, preview draft vs published/rollback.
- Jangan mengklaim jumlah tes pass tanpa run terbaru yang berakhir `success` dan SHA tepat; tuliskan blocker akses test DB/browser.
- Grep/GitHub search terakhir harus mencatat residual `Gheverhan` beserta klasifikasi A/B/C/D/E; residual kompatibilitas di C/D **diizinkan** dan harus dijelaskan.

### Gate penerimaan per gelombang

| Gate | Syarat pass | Jika gagal |
| --- | --- | --- |
| G0 Audit | Baseline, klasifikasi string, diagram efek published theme, risiko dan data sensitive telah dipetakan | Jangan coding berskala luas |
| G1 UI | Semua permukaan user-facing demo berbrand JetSeller dan UI responsive | Perbaiki di branch PR |
| G2 Data theme | Preview dan published demo benar-benar JetSeller, histori revision/rollback utuh | Jangan klaim selesai di prod |
| G3 Regression | CI lint/typecheck/build/unit/integration/browser sesuai kemampuan & SHA benar, tidak ada flow rusak | Jangan merge/deploy |
| G4 Production | Backup verified, owner approval, deploy verified, smoke kedua host, cache/logo ok | Rollback atau BLOCKED |
| G5 Repo rename/private | Private deployment auth terbukti, Codex/reviewer/GitHub Actions/VPS access PASS, owner approval | Tetap nama/visibility lama |

### Risk register

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Mengubah `legacyDefault` & isLegacy sembrono | Published theme diabaikan, rollback tidak cocok | Snapshot fixture + tests, bukan mass rename |
| Mengubah JWT issuer/audience `gheverhan` | Sesi login existing tidak valid | Freeze protocol constants |
| Mengganti semua env `GHEVERHAN_*` | Runtime/deployment berhenti | Technical names immutable pada fase visual |
| Mengganti raw URL repo sebelum private auth | Landing static deploy tak bisa download | Jalur privat diuji dulu |
| Terjadi publish tema tanpa version guard | Konflik draft/rollback/admin | Gunakan service resmi dengan versi |
| Mengubah legal entity/receipts historis | Risiko kepatuhan dan rekonsiliasi | Ubah hanya copy brand yang aman |
| Mengubah J&T settings | Shipping tidak bekerja | Out of scope, tests read-only |
| Menyatukan landing + storefront route `/` | Domain JetSeller bentrok dengan demo | Pertahankan Caddy host isolation |

## 7. Output yang wajib dibuat Codex per fase

- `docs/rebranding-jetseller/reports/01-baseline-audit.md` — inventaris A–E dengan source+proof, status prod, risks.
- `docs/rebranding-jetseller/reports/02-ui-implementation.md` — file changes, desain, screens, perlindungan compatibility.
- `docs/rebranding-jetseller/reports/03-qa-matrix.md` — perintah/test/run SHA, hasil browser, regression, known issues.
- `docs/rebranding-jetseller/reports/04-production-handoff.md` — backup gate, exact commit, prosedur publish theme, smoke, rollback, operator, prod verdict.
- `docs/rebranding-jetseller/reports/05-private-repo-readiness.md` — dependency inventory, authenticated deploy, GitHub/Codex/VPS readiness, pending approvals. **Tidak berarti rename/private sudah dilakukan.**
- PR A hanya frontend + laporan; PR berikutnya untuk deploy ops jika perlu; PR untuk private-repo readiness terpisah. Jangan gabungkan semuanya menjadi satu patch raksasa.
- Setiap laporan membedakan `DONE`, `NOT DONE`, `BLOCKED`, `NOT VERIFIED`. Jangan menyembunyikan blocker.

## 8. Mandat Codex yang berlaku

Baca `README.md` dan `PROMPT_CODEX.md` dalam folder ini. **Implementasi mengikuti plan ini sebagai source of truth**, bukan asumsi. Codex boleh menyelesaikan audit, kode UI, test, dan PR dalam satu pekerjaan. **Jangan mengubah production, database live, DNS, nama repo, visibility repo, Secrets, JWT compatibility atau konten legal yang membutuhkan owner** tanpa gate/approval eksplisit yang tepat. Tetap laporkan hasil walau ada blocker.
