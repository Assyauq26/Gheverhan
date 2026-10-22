# Dependency residual risk decision — belum disetujui

Matriks tujuh packages, versi, advisory, reachability dan kontrol kanonik di HIGH_RISK_REVIEW.md. Audit lockfile ulang22 Oktober 2026 tetap0 Critical / 7 High / 0 Moderate, tujuh node satu GHSA-vfj7-8cjw-p6xm. Tidak menurunkan severity atau menyembunyikan audit nonzero.

Tidak ada patched braces release yang dibuktikan audit ini; npm menyarankan major Tailwind4.3.3 atau downgrade eslint-config-next14.2.35, bukan compatible patch untuk stack Next 15/Tailwind 3. Tidak melakukan upgrade/downgrade spekulatif. Guard depth128+checksum fail-closed dan9 mitigation tests melindungi jalur tooling yang ditelaah; raw dependency tetap rentan sebelum prepare. Untrusted glob/build config tidak boleh dieksekusi di luar guard. Runtime customer HTTP tidak ditemukan mencapai compiler tersebut, tetapi non-dev lock nodes tidak dianggap otomatis aman.

| Keputusan yang diminta | Status |
| --- | --- |
| Remediasi major toolchain lewat PR terpisah + Next/CSS/lint/browser regression | Opsi, belum diperintahkan sebagai scope terpisah |
| Terima residual tujuh nodes hanya pada source/lock/guard yang direview, larang inputglob tidak dipercaya, ulang audit setiap upgrade | **PENDING explicit owner decision** |
| Pengecualian severity/audit agar hijau | Tidak dilakukan |

Acceptance harus menyebut SHA/lockfile, advisory, control obligations, owner dan tanggal review ulang; tidak dianggap waiver permanen. Jika tidak diterima/remediasi, release NO-GO.
