# Sprint 0A — Critical Vulnerability Containment

Tanggal: **14 Oktober 2026 (UTC)**. Baseline: `3997430071cceb3f2f92992dd2dafba028450154`, branch `chore/sprint-0-codebase-audit-cleanup`, Draft PR [#19](https://github.com/Assyauq26/Gheverhan/pull/19).

**Hasil:** containment pada jalur npm test dan workflow unit CI diterapkan dan diuji tanpa upgrade dependency. Seluruh 41 unit test lama tetap lulus; satu regression test worker baru menambah total menjadi **42 test/6 file**. Profil container offline juga lulus **25 pemeriksaan containment**, tanpa skip. CVE belum diperbaiki: audit tetap **2 Critical, 9 High, 7 Moderate**.

## 1. Acuan dan kondisi eksploitasi

[Laporan CVE](CODEBASE_CLEANUP_REPORT.md#16-audit-cve-resmi-npm--tindak-lanjut-persetujuan-eksplisit) dan [rencana remediasi](SECURITY_REMEDIATION_PLAN.md) dibaca sebelum perubahan. Dependency tetap Vitest2.1.3 → Tinypool1.1.1; Vite5.4.21, Next15.5.26, Tailwind3.4.14, kedua PostCSS8.4.x, React18.3.1 dan Prisma5.22.0 tidak dinaikkan/downgrade/dihapus.

| Temuan | Kondisi yang memungkinkan exploit | Containment sekarang | Residual |
| --- | --- | --- | --- |
| CVE-2025-24964 / GHSA-9crc-q9x8-hgqq, Critical Vitest | API/UI WebSocket aktif; malicious website atau client dapat memanggil edit/rerun test | Supported npm entrypoint menolak API/UI dan alternate config; CLI final memaksa API/UI off; test worker CI tidak memiliki network | Direct Vitest invocation/custom source/config dapat melewati wrapper pada mesin lokal; dependency masih vulnerable |
| CVE-2026-47429 / GHSA-5xrq-8626-4rwp, Critical Vitest | UI/API diekspos, atau Browser/UI di Windows; file read/write dan execution dapat terjangkau | Browser Mode, UI, API/debugger ditolak; Vitest memakai Node environment dan loopback Vite config | Developer yang memakai command lain/unsafe NODE_OPTIONS tetap perlu kontrol perangkat/infrastruktur; tidak ada sertifikasi Windows |
| CVE-2026-104848 / GHSA-5gmw-xhrv-c9v3, Critical Tinypool | Prototype pollution sebelumnya memengaruhi inherited worker env/execArgv; worker berikutnya menjalankan kode attacker | `--disable-proto=throw` pada parent dan fork worker; CI container non-root/offline/secretless untuk membatasi dampak arbitrary execution | Constructor/prototype mutation atau trusted-code tampering tidak ditutup oleh flag Node; gadget belum dipatch |
| CVE-2026-104849 / GHSA-85c8-ppgw-ccpr, Critical Tinypool | Polluted `filename` + options object pada pool.run + attacker module | Batas container mengurangi akses jaringan/host/credential; common __proto__ primitive ditolak pada worker yang sebenarnya | Vitest memang memberi options object; tidak ada klaim seluruh prototype-pollution primitive dicegah |

Ini empat advisory Critical yang menghasilkan dua entri paket Critical, bukan empat paket baru. API/UI Vitest sudah off secara default pada baseline, tetapi default dapat diubah oleh CLI. Containment mengubah default itu menjadi policy pada **supported entrypoint**, bukan mengklaim seluruh arbitrary JavaScript dapat disandbox oleh validator argumen.

## 2. Inventaris sebelum perubahan

- Tidak ada `.github/workflows` tracked pada baseline; tidak ada pipeline repository yang dapat diklaim sudah terisolasi.
- `npm test` langsung menjalankan `vitest run`; `test:watch` langsung `vitest`. Flag API/UI/browser/config/worker bisa ditambahkan caller.
- `vitest.config.ts` hanya menetapkan environment Node, include unit tests, dan alias. Tidak ada penegasan API/UI/browser/host atau worker resource limits.
- `dev` dan `start` menjalankan Next development bind `0.0.0.0`; production `serve` juga bind `0.0.0.0`, tetapi itu command production terpisah yang tidak diubah.
- Pemeriksaan TCP saat pengujian tidak menemukan listener Next3000/Vitest51204; listener lain di luar scope tidak diubah. Runtime ingress/firewall/Actions secret policy tidak dimutasi.

## 3. Perubahan repository

| File / perubahan | Efek dan batas |
| --- | --- |
| `frontend/scripts/run-tests.mjs` | Wrapper untuk run/watch; hanya menerima unit-file/name filters dan built-in default/verbose reporter. Menolak API/UI/browser/debugger/host/alternate config/workspace/root/worker override/custom reporter/terminator. Argumen disampaikan sebagai array tanpa shell. CI wajib full suite, tanpa filters/watch |
| `frontend/vitest.config.ts` | API/UI/browser disabled eksplisit, Node environment dipertahankan, Vite loopback/CORS off/HMR off/strict filesystem, max2/min1 worker. Cache random/private melalui mkdtemp di tmp directory. Fork pool tetap sesuai default Vitest2 dan mendapat execArgv Node defense |
| `frontend/tests/security/containment.test.mjs` | Native Node regression untuk flag resolution, dangerous CLI rejection, legitimate filters, CI full-suite policy, dan __proto__ defense. Lima assertions tambahan hanya didaftarkan dalam profil isolated container; bukan test yang diberi skip |
| `frontend/tests/unit/containment-worker.test.ts` | Membuktikan common __proto__ assignment ditolak dalam **worker Vitest nyata**, bukan hanya process parent atau mock |
| `frontend/package.json` | Hanya npm scripts berubah. `test`/watch memakai wrapper; `test:containment`/`test:ci` ditambahkan. `dev`/`start` default loopback; `dev:preview` menyediakan command lama untuk preview yang sengaja diekspos. Tidak ada perubahan dependency/engines/Prisma seed config |
| `frontend/Dockerfile.test` + `.dockerignore` | Unit-test image Node22.22.0 dan BuildKit frontend pinned digest. Online phase hanya memasang locked packages dengan `--ignore-scripts` dan menjalankan Prisma engine downloader pinned. Source/config/test belum dicopy pada fase online; generator schema dan semua unit execution dilakukan offline. `.env`, credentials/key files, `.npmrc`, Git metadata, runtime/build artifacts tidak dicopy |
| `.github/workflows/test-containment.yml` | Workflow pull_request/workflow_dispatch baru, bukan pull_request_target. GitHub-hosted Ubuntu24.04 ephemeral; contents read; checkout pinned SHA dan persist-credentials false; sparse checkout frontend. Container unit offline tidak diberi host env/secret/socket/volume atau publish port |

Production `serve`, Netlify build, routes, auth/RBAC/business services, provider adapters, database schema dan migrations tidak diubah. Supported watch tetap menjalankan test dan menunggu perubahan file; tidak membuka API/UI/HMR TCP listener dalam pengujian.

## 4. Isolasi CI yang diuji

Command runtime workflow:

```sh
docker run --rm --network=none --read-only --cap-drop=ALL \
  --security-opt=no-new-privileges --pids-limit=128 --memory=2g --cpus=2 \
  --tmpfs /tmp:rw,noexec,nosuid,size=256m,uid=1000,gid=1000,mode=1777 \
  gheverhan-unit-tests
```

Source writable berada pada copy di tmpfs `/tmp/project`; dependencies tetap read-only pada image. Tidak ada mount workspace host atau Docker socket. Runtime memakai user `node` (UID1000), tanpa capability efektif dan `NoNewPrivs=1`. Assertions nyata memeriksa tidak ada external adapter, write ke image ditolak, host Docker socket/Git metadata tidak tersedia, dan named runtime secrets tidak hadir. Tidak ada network-enabled fallback jika test gagal.

Kernel cgroup pada run lokal terisolasi melaporkan `memory.max=2147483648`, `pids.max=128`, `cpu.max=200000 100000` (2 CPU). `/tmp` dibatasi256MiB. Job GitHub mempunyai timeout20menit. Pembatasan ini mengurangi dampak worker/code yang menghabiskan resource; tidak menghilangkan kernel/container-escape risk.

Image build memakai Node22.22.0/npm10.9.4; checks host memakai Node22.22.0/npm11.9.0. Lockfile v3 yang sama dipakai keduanya, tanpa regenerasi. Node image digest `dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94`, BuildKit frontend digest `4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e`, dan checkout commit `11bd71901bbe5b1630ceea73d27597364c9af683` diverifikasi melalui pull/build log dan GitHub API.

Untuk Cloud Environment dengan proxy CA, build yang diuji menggunakan public CA sebagai BuildKit secret mount, bukan COPY ke image:

```sh
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" \
  --file frontend/Dockerfile.test --tag gheverhan-unit-tests frontend
```

Registry credentials/proxy/CA trust tetap dipertahankan; tidak ada TLS/checksum verification yang dinonaktifkan. Fase downloader online masih menjalankan dependency code yang dikunci, sehingga review lockfile/installer integrity dan minimal privilege tetap diperlukan. Itu bukan jalur untuk mengeksekusi source test yang tidak tepercaya secara online. Dockerfile/workflow yang sengaja diubah oleh PR berbahaya memerlukan kontrol manual pada bagian7.

Image ini **khusus unit test**, bukan image deployment/DB integration. Prisma generate offline lulus, tetapi base slim memperingatkan libssl tidak terdeteksi dan memakai fallback openssl1.1. Tidak ada query DB dari image ini. Sebelum menggunakannya untuk integration database, sediakan image/SSL runtime yang sesuai pada scope terpisah; jangan menganggap keberhasilan unit mock membuktikan runtime query engine siap production.

## 5. Bukti regression gates

| Gate | Hasil |
| --- | --- |
| Locked install dalam image, hooks disabled | PASS; lockfile tidak berubah; hanya engine downloader yang dijalankan pada fase online |
| Prisma generate dalam build container `--network=none` | PASS, Client5.22.0; dummy DB loopback, tanpa seed/migrasi/query |
| Native containment local profile | PASS:20 pemeriksaan, nol skip |
| Native containment offline container profile | PASS:25 pemeriksaan, nol skip; lima memeriksa boundary container nyata |
| Seluruh unit test melalui wrapper | PASS:42 test/6 file; 41 test lama + satu worker regression; nol skip |
| Seluruh unit test dalam offline hardened container | PASS:42 test/6 file; total67 checks bersama containment profile |
| Watch smoke | PASS:42 test lulus, watch tetap aktif, delta TCP LISTEN kosong; proses dihentikan setelah probe |
| Typecheck | PASS, `npm run typecheck -- --incremental false` |
| Lint | PASS, nol warning/error; deprecation next lint/Vite CJS tetap pemberitahuan tooling |
| Production build + Prisma generate host | PASS; dummy DATABASE_URL/DIRECT_URL pada127.0.0.1:1; tidak ada seed/migrate/bootstrap atau akses production |
| Workflow syntax / pinned checkout source | YAML parse/security fields PASS; checkout SHA ada pada official actions/checkout |
| Dependency / lockfile / protected artifacts | dependencies/devDependencies/engines/Prisma settings identik; lockfile SHA-256 `3eea0888c85f52b41599ec7042917051308f73431eb98a0c088732981d851b66`; `.postgres` diff kosong |
| npm audit resmi ulang | Selesai exit1 karena 18 entri:2 Critical,9 High,7 Moderate; **tidak** diperlakukan sebagai clean audit |
| GitHub-hosted workflow / external policy | Eksekusi image/command sama dibuktikan lokal. Status remote job dan setting fork/secrets/branch protection harus diverifikasi di GitHub; bukan klaim seluruh policy remote sudah diterapkan |
| DB/storage E2E, deployment | Tidak dijalankan; tidak relevan sebagai izin mengakses production pada containment ini |

Test worker baru awalnya gagal karena flag parent tidak diteruskan otomatis oleh Vitest2. `poolOptions.forks.execArgv` eksplisit memperbaiki propagation dan test tersebut kemudian lulus. Typecheck awal juga mendeteksi `browser.name` wajib pada API config Vitest2 meskipun browser disabled; diperbaiki sebelum final gates. Kegagalan subprocess pada sandbox executor awal (EPERM) diselesaikan melalui execution permission yang sesuai; tidak ada test yang di-skip atau assertion yang dilonggarkan untuk melewatinya.

Tidak ada scan advisory suppression, audit fix, override dependency, downgrade, atau penghapusan test. Generated `next-env.d.ts` yang berubah akibat tooling dikembalikan ke byte baseline.

## 6. Pemakaian developer dan preview

- `npm test`: full suite. Pada trusted local checkout, file filter/name filter tetap didukung, misalnya `npm test -- tests/unit/auth-actions.test.ts -t logout`.
- `npm run test:watch`: watch Node tests tanpa browser/API/UI. Di CI mode watch/filters ditolak agar tidak membatasi full regression gate.
- `npm run test:ci`: native containment lalu seluruh unit test. **Pada mesin lokal command ini bukan OS sandbox dan tetap mewarisi environment developer**; gunakan image offline untuk source/test yang belum dipercaya.
- `npm run dev` / `npm start`: loopback127.0.0.1:3000. Ini memperkecil default dev exposure, bukan firewall yang melarang pemilik mesin menjalankan command lain.
- `npm run dev:preview`: bind0.0.0.0:3000 seperti sebelumnya, hanya untuk managed preview dengan ingress yang sengaja diizinkan/dilindungi. Ubah start instruction Cloud Environment/proxy bila memang membutuhkan preview; tidak dilakukan otomatis pada turn ini.

Environment variables/flags atau direct binary `npx vitest`, Vite/custom server, Node inspector/preloads, dan arbitrary test JavaScript bisa melewati wrapper. Node debugger/preload dapat mulai sebelum JavaScript wrapper berjalan; pada untrusted execution, security boundary yang diperlukan adalah sandbox/infrastructure, bukan sekadar script validator.

## 7. Tindakan manual di luar repository

Observasi akses: pembacaan PR #19 melalui `api.github.com` berhasil (HTTP 200), tetapi `GET /repos/Assyauq26/Gheverhan/actions/permissions` mengembalikan HTTP 403, `Resource not accessible by integration`. Ini batas izin integrasi pada endpoint administratif Actions, bukan penolakan domain oleh kebijakan jaringan. Karena itu setting Actions/approval belum terverifikasi dan memerlukan pemeriksaan maintainer. Tidak ada perubahan setting infrastruktur atau upaya melewati pembatasan tersebut.

1. **GitHub Actions approval:** verifikasi Actions enabled/allowed actions dan approval untuk seluruh outside collaborators/fork workflows. Review diff workflow/Dockerfile/lockfile/scripts sebelum memberi izin run, terutama PR yang mengganti containment. Jangan menjalankan PR head dengan `pull_request_target` dan privileged token.
2. **GitHub secret/token policy:** tetapkan default workflow token read-only, cegah pemberian production secrets pada job untrusted, gunakan protected environments untuk deployment dan jangan kirim kredensial ke build/test container. Default read-only bukan batas maksimal jika workflow diubah; reviewer policy tetap diperlukan. Tidak ada environment/deploy job pada workflow baru ini.
3. **Protected files/branches:** buat required review/CODEOWNERS untuk workflow, Dockerfile.test, package/lockfile, runner/config dan security tests dengan maintainer yang berwenang; require containment check setelah remote workflow terkonfirmasi bekerja. Perubahan branch protection/CODEOWNERS assignment tidak diasumsikan sudah berlaku.
4. **Runner infrastructure:** gunakan hosted/ephemeral runner; jangan pindahkan job ini ke self-hosted persistent runner yang memiliki production credentials, writable shared caches, SSH agents atau host mounts. Patch Docker/host kernel; untuk kode yang sengaja hostile, gunakan ephemeral VM/stronger isolation. Minimal egress pada dependency preparation membutuhkan kontrol provider/firewall di luar repo; runtime test sudah `--network=none`.
5. **Ingress/developer workstation:** lindungi managed dev preview dengan auth/access control dari platform atau trusted network. HTTP egress allowlist Cloud Environment bukan policy inbound. Jangan expose Vitest/Vite/Node debugger ke internet atau membuka website tak dipercaya saat menjalankan tooling server vulnerable. Pastikan unsafe NODE_OPTIONS/preload dan mesin developer Windows ditinjau terpisah.
6. **Remote proof sebelum promotion:** periksa run GitHub pada SHA containment, fork policy, permissions efektif, environment secret usage, dan protected-file review. Setting remote yang belum dapat diobservasi harus ditandai pending, bukan dianggap aman berdasarkan YAML lokal saja.

## 8. Risiko residual dan kesiapan Sprint 0B

**Dua entri Critical tetap terbuka.** Flag Node memblokir accessor/setter `__proto__`, tetapi tidak membekukan `Object.prototype` atau mencegah semua constructor/prototype mutation. Tinypool gadgets/API Vitest lama belum mendapat patch. Container juga tidak menjamin tahan kernel escape, malicious dependency installer, modification workflow, log disclosure, atau semua serangan supply chain. Dependency/config upgrades permanen tetap mengikuti sprint test pada rencana remediasi.

Enam High production tree dan temuan source non-CVE juga belum diperbaiki. Tidak ada penurunan severity atau persetujuan risiko tersisa yang tersirat karena tests lulus. Containment ini tidak memberi clearance merge/deploy production.

**Sprint 0B dapat dilanjutkan secara terkendali** pada checkout/reviewer-approved code dan runner isolated yang telah diuji, tanpa production credentials/data. Sebelum otomatis mengeksekusi source untrusted di GitHub, selesaikan manual approval/protected-file/secret checks di atas dan verifikasi remote job. Upgrade dependency Sprint0B memerlukan instruksi/persetujuan tersendiri; tahap ini tidak menerapkannya. Kandidat berikut paling kecil adalah root PostCSS minor sesuai plan, dengan nested PostCSS/residual Critical tetap dilaporkan dan regression gates diulang.
