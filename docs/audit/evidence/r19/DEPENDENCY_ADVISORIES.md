# R19 — Rincian advisory dependency

Angka npm audit menghitung package entries; tabel advisory dapat berisi lebih dari satu baris per package. Setelah pembaruan kompatibel: **2 Critical, 8 High, 5 Moderate, 15 entries**. Major upgrade belum diterapkan.

| Package / jenis | Installed | Advisory / severity | Patched releases resmi | Source |
| --- | --- | --- | --- | --- |
| @next/eslint-plugin-next / transitive | 15.5.28 | transitive / high | Lihat advisory dependency di bawah | frontend/package-lock.json:1405 |
| @vitest/mocker / transitive | 2.1.9 | GHSA-82fw-gwwq-j7x9 / moderate | 4.1.11, 5.0.0-rc.2 | frontend/package-lock.json:3452 |
| @vitest/mocker / transitive | 2.1.9 | transitive / moderate | Lihat advisory dependency di bawah | frontend/package-lock.json:3452 |
| braces / transitive | 3.0.3 | GHSA-vfj7-8cjw-p6xm / high | Tidak tersedia di metadata | frontend/package-lock.json:3996 |
| chokidar / transitive | 3.6.0 | transitive / high | Lihat advisory dependency di bawah | frontend/package-lock.json:4182 |
| esbuild / transitive | 0.21.5 | GHSA-67mh-4wv8-2f99 / moderate | 0.25.0 | frontend/package-lock.json:9646 |
| eslint-config-next / direct | 15.5.28 | transitive / high | Lihat advisory dependency di bawah | frontend/package-lock.json:4956 |
| fast-glob / transitive | 3.3.1 | transitive / high | Lihat advisory dependency di bawah | frontend/package-lock.json:5383 |
| micromatch / transitive | 4.0.8 | transitive / high | Lihat advisory dependency di bawah | frontend/package-lock.json:6790 |
| postcss-nested / transitive | 6.2.0 | transitive / moderate | Lihat advisory dependency di bawah | frontend/package-lock.json:7481 |
| postcss-selector-parser / transitive | 6.1.4 | GHSA-rj75-hqrm-r3gf / moderate | 7.1.6 | frontend/package-lock.json:7506 |
| tailwindcss / direct | 3.4.14 | transitive / high | Lihat advisory dependency di bawah | frontend/package-lock.json:8555 |
| tailwindcss / direct | 3.4.14 | transitive / high | Lihat advisory dependency di bawah | frontend/package-lock.json:8555 |
| tailwindcss / direct | 3.4.14 | transitive / high | Lihat advisory dependency di bawah | frontend/package-lock.json:8555 |
| tailwindcss / direct | 3.4.14 | transitive / high | Lihat advisory dependency di bawah | frontend/package-lock.json:8555 |
| tailwindcss / direct | 3.4.14 | transitive / high | Lihat advisory dependency di bawah | frontend/package-lock.json:8555 |
| tinypool / transitive | 1.1.1 | GHSA-5gmw-xhrv-c9v3 / critical | 2.1.1 | frontend/package-lock.json:8756 |
| tinypool / transitive | 1.1.1 | GHSA-85c8-ppgw-ccpr / critical | 2.1.2 | frontend/package-lock.json:8756 |
| vite / transitive | 5.4.21 | GHSA-4w7w-66w2-5vf9 / moderate | 6.4.2, 7.3.2, 8.0.5 | frontend/package-lock.json:9172 |
| vite / transitive | 5.4.21 | GHSA-v6wh-96g9-6wx3 / moderate | 6.4.3, 7.3.5, 8.0.16 | frontend/package-lock.json:9172 |
| vite / transitive | 5.4.21 | GHSA-fx2h-pf6j-xcff / high | 6.4.3, 7.3.5, 8.0.16 | frontend/package-lock.json:9172 |
| vite / transitive | 5.4.21 | transitive / high | Lihat advisory dependency di bawah | frontend/package-lock.json:9172 |
| vite-node / transitive | 2.1.9 | transitive / moderate | Lihat advisory dependency di bawah | frontend/package-lock.json:9232 |
| vitest / direct | 2.1.9 | transitive / critical | Lihat advisory dependency di bawah | frontend/package-lock.json:9685 |
| vitest / direct | 2.1.9 | GHSA-5xrq-8626-4rwp / critical | 3.2.6, 4.1.0 | frontend/package-lock.json:9685 |
| vitest / direct | 2.1.9 | GHSA-82fw-gwwq-j7x9 / moderate | 4.1.11, 5.0.0-rc.2 | frontend/package-lock.json:9685 |
| vitest / direct | 2.1.9 | transitive / critical | Lihat advisory dependency di bawah | frontend/package-lock.json:9685 |
| vitest / direct | 2.1.9 | transitive / critical | Lihat advisory dependency di bawah | frontend/package-lock.json:9685 |
| vitest / direct | 2.1.9 | transitive / critical | Lihat advisory dependency di bawah | frontend/package-lock.json:9685 |

Detail reachability, compatibility impact, proposed fix dan hasil regresi per baris tersedia pada `dependency-findings.json`. Versi patched dicocokkan dengan metadata resmi GitHub Advisory; tidak semua cutoff lintas major dapat diterapkan ke stack ini.

Advisory yang tidak lagi muncul setelah lockfile baru:

- next GHSA-4jqv-mc3x-m676: 15.5.26 → 15.5.28; audit ulang tidak lagi mencantumkan advisory ini.
- next GHSA-mcj8-r9mp-w47p: 15.5.26 → 15.5.28; audit ulang tidak lagi mencantumkan advisory ini.
- postcss GHSA-qx2v-qp2m-jg93: 8.4.31,8.4.47 → 8.5.23; audit ulang tidak lagi mencantumkan advisory ini.
- postcss GHSA-6g55-p6wh-862q: 8.4.31,8.4.47 → 8.5.23; audit ulang tidak lagi mencantumkan advisory ini.
- postcss GHSA-fxqj-rqcc-2cmp: 8.4.31,8.4.47 → 8.5.23; audit ulang tidak lagi mencantumkan advisory ini.
- postcss GHSA-r28c-9q8g-f849: 8.4.31,8.4.47 → 8.5.23; audit ulang tidak lagi mencantumkan advisory ini.
- vitest GHSA-9crc-q9x8-hgqq: 2.1.3 → 2.1.9; audit ulang tidak lagi mencantumkan advisory ini.

Rantai CSS/glob belum memiliki endpoint input pengguna yang ditemukan, namun tetap dilaporkan. Menjalankan `npm audit fix --force` bukan mitigasi yang diizinkan.
