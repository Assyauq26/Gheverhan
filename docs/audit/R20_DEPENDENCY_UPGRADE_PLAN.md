# R20 — Matriks risiko dependency sebelum major upgrade

| Kelompok | Usulan | Risiko | Validasi / rollback |
| --- | --- | --- | --- |
| Kompatibel CSS | Tailwind3.4.14 →3.4.19 | Perubahan patch compiler CSS dan lockfile transitive; tidak menghilangkan braces advisory | Build,203 unit+25 containment, navigasi4 viewport; kembalikan commit package/lock jika gagal |
| Tooling test major | Vitest2.1.9 →4.1.11 | poolOptions/minWorkers/browser config berubah; mock reset dan fake timers perlu dibuktikan. Node22 didukung. Framework Next tetap15.5.28. | Migrasikan execArgv worker tanpa menghilangkan disable-proto; CLI API/UI/browser/debugger tetap off; semua containment dan unit wajib lulus offline; typecheck+build+integration akhir |
| Tooling CSS major | Tailwind4 dan ESLint/Next plugin generasi baru | Default border/shadow/token serta browser support dapat berubah; Next15 tooling plugin perlu matriks peer yang tepat. Braces belum memiliki patched release resmi. | Tidak menerapkan major CSS/lint tanpa regresi visual lengkap dan persetujuan kompatibilitas; tetap OPEN di audit. Tidak menghapus dependency atau severity dari laporan untuk membuat hijau. |

Vitest4.1.11 merupakan cutoff patched untuk @vitest/mocker; dependency runner tidak lagi memakai Tinypool1.1.1 yang memiliki2 advisory Critical. Lockfile hasil resolusi wajib diaudit, termasuk Vite yang ikut dipasang. Vitest5 tidak dipilih karena menambah perubahan major tanpa kebutuhan fix tambahan yang terbukti untuk scope ini. Branch `security/r20-test-toolchain-upgrades` terpisah dari integrasi.
