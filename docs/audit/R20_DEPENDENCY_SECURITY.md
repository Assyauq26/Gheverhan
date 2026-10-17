# R20 — Dependency security

Status full lockfile: **0 Critical,7 High,2 Moderate** setelah Vitest4.1.11/Vite8.3.4 dan Tailwind3.4.19. Production-only masih **0 Critical,5 High,2 Moderate**; akan diulang pada lockfile final. Severity resmi dipertahankan.

| Package | Versi | Jenis | Advisory / severity | Patched release resmi |
| --- | --- | --- | --- | --- |
| @next/eslint-plugin-next | 15.5.28 | transitive | transitive:fast-glob / high | Lihat dependency |
| braces | 3.0.3 | transitive | GHSA-vfj7-8cjw-p6xm / high | Belum tersedia |
| chokidar | 3.6.0 | transitive | transitive:braces / high | Lihat dependency |
| eslint-config-next | 15.5.28 | direct | transitive:@next/eslint-plugin-next / high | Lihat dependency |
| fast-glob | 3.3.1, 3.3.3 | transitive | transitive:micromatch / high | Lihat dependency |
| micromatch | 4.0.8 | transitive | transitive:braces / high | Lihat dependency |
| postcss-nested | 6.2.0 | transitive | transitive:postcss-selector-parser / moderate | Lihat dependency |
| postcss-selector-parser | 6.1.4 | transitive | GHSA-rj75-hqrm-r3gf / moderate | 7.1.6 |
| tailwindcss | 3.4.19 | direct | transitive:chokidar / high | Lihat dependency |
| tailwindcss | 3.4.19 | direct | transitive:fast-glob / high | Lihat dependency |
| tailwindcss | 3.4.19 | direct | transitive:micromatch / high | Lihat dependency |
| tailwindcss | 3.4.19 | direct | transitive:postcss-nested / high | Lihat dependency |
| tailwindcss | 3.4.19 | direct | transitive:postcss-selector-parser / high | Lihat dependency |

Sumber lockfile/line, reachability, dampak kompatibilitas, proposed fix dan metadata resmi per finding ada pada `evidence/r20/dependency-findings.json`.

Dua package Critical pada R19 tertutup melalui migrasi Vitest4.1.11; Tinypool1.1.1 tidak lagi menjadi dependency. Regresi203 unit+25 containment offline, typecheck/build dan hydration replay toolchain PASS; source gabungan menambah tes auth/status dan diuji ulang terpisah. Percobaan TSX awal gagal karena Oxc mengikuti jsx:preserve; konfigurasi test diperbaiki tanpa menghapus suite/assertion. Rencana dan rollback pada `R20_DEPENDENCY_UPGRADE_PLAN.md`, review terpisah di PR #62.

High tersisa berasal dari braces/glob pada Tailwind/lint. Tailwind config memakai glob source statis; upload pelanggan memakai storage adapter dan magic/MIME validation, tidak menulis CSS/glob ke source compiler. Kode request tidak mengimpor compiler Tailwind/fast-glob. Ini membatasi reachability production, tetapi tidak menghilangkan advisory atau merupakan persetujuan risiko oleh pemilik.

Migrasi Tailwind4 dapat mengubah default border/shadow/token dan minimum browser; rantai Next ESLint plugin juga memerlukan pasangan versi lint yang diuji. Tidak mengganti framework Next15 menjadi Next16 otomatis, memakai audit overrides untuk menyembunyikan severity, atau menghapus package dari laporan. Major toolchain berikutnya membutuhkan review kompatibilitas terpisah. **Release tetap NOT READY** selama High/risiko residual belum dimitigasi dan disetujui.

Credential/runtime PostgreSQL tracked tetap assessment terpisah #39 HOLD; tidak membaca snapshot fisik, rewrite history, rotasi key, atau mengklaim ketiadaan nilai yang terbukti bocor sebagai bukti aman.
