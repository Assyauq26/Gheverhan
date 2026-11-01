# Rilis statis JetSeller V3 dari terminal Helipod

Jalankan hanya di terminal Bash VPS Helipod yang sudah berhasil login dan
memiliki akses `sudo`, setelah commit perbaikan direview. PR/CI tidak menjalankan
deployment. Jangan memakai SSH key restricted untuk upload image sebagai shell.

## Jika skrip lama gagal dengan `template parsing error: unexpected EOF`

Kesalahan terjadi saat membaca mount Docker, sebelum download, backup, atau
pertukaran aset aktif. Untuk kegagalan persis ini, rollback aset tidak diperlukan.
Jangan jalankan kembali salinan skrip lama dari commit `e3090da`.

Template yang benar menutup **if dan range**:

```bash
sudo docker inspect deploy_proxy_1 --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}'
```

Output harus satu path direktori `/data` di host. Jika kosong/error, berhenti.
`bash -n` hanya memeriksa sintaks Bash; ia tidak mem-parsing Go template.

## Unduh, periksa, lalu jalankan

Isi dua nilai berikut dari commit perbaikan yang telah direview dan checksum
skrip yang tercantum dalam PR. Gunakan SHA lengkap, bukan `main` atau URL skrip
lama. Blok dijalankan dalam subshell agar kegagalan menghentikan blok tanpa
menutup terminal login Anda.

```bash
(
  set -euo pipefail
  RELEASE_SHA='ISI_SHA_COMMIT_PERBAIKAN_40_KARAKTER'
  SCRIPT_SHA256='ISI_CHECKSUM_SHA256_SKRIP_64_KARAKTER'
  [[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]
  [[ "$SCRIPT_SHA256" =~ ^[0-9a-f]{64}$ ]]
  script="$(mktemp /tmp/jetseller-v3-release.XXXXXXXX.sh)"
  curl -fLsS --retry 3 --max-time 60 \
    "https://raw.githubusercontent.com/Assyauq26/Gheverhan/$RELEASE_SHA/landing/jetseller/deploy/release-v3-from-vps.sh" \
    -o "$script"
  printf '%s  %s\n' "$SCRIPT_SHA256" "$script" | sha256sum -c -
  bash -n "$script"
  sudo bash "$script"
)
```

Skrip mempertahankan pin delapan aset runtime ke commit V3 `b82b190`.
Ia memeriksa Caddy dan kedua URL, menyiapkan staging, memverifikasi arsip backup,
lalu memindahkan direktori aset. Tidak ada restart container, reload Caddy,
perubahan konfigurasi, migrasi, atau deployment backend Gheverhan. Dua rename
berurutan dapat menyebabkan jeda singkat ketika path aktif belum ada.

Berhasil hanya bila keluar dengan status 0 dan mencetak:

```text
SUCCESS: JetSeller V3 LIVE; Gheverhan health OK.
```

Simpan path `Previous version` dan `Backup` dari output. Setelah itu:

```bash
curl -fLsS --max-time 25 https://jetseller.web.id/ | grep -F '/assets/css/refactor.css'
curl -fLsS --max-time 25 https://jetseller.web.id/assets/css/refactor.css | grep -F 'background-size:36px 36px'
curl -fLsS --max-time 25 https://gheverhan.store/api/v1/health
```

## Kegagalan dan rollback

- Error sebelum swap: aset aktif tetap tersedia; jangan menghapus backup/staging.
- Aktivasi/verifikasi gagal atau menerima INT/TERM: skrip mencoba memulihkan
  direktori sebelumnya, tetap keluar nonzero, dan tidak mencetak SUCCESS.
- `ROLLBACK COMPLETED` menyatakan direktori dipulihkan; periksa URL JetSeller dan
  health Gheverhan lagi. Jika health tetap gagal, hentikan tindakan deployment.
- `CRITICAL`: pemulihan belum terkonfirmasi. Simpan output, path previous dan
  backup. Jangan mengulang deployment atau menghapus aset; periksa direktori
  melalui operator VPS yang berwenang. Direktori download dapat tertinggal.
- SIGKILL, reboot, atau putus daya tidak dapat ditangani trap Bash. Jika terminal
  terputus, periksa proses dan aset dahulu, jangan menjalankan deploy paralel.

Untuk rollback manual setelah rilis sukses, gunakan **path previous persis dari
output rilis tersebut**, bukan timestamp baru atau wildcard. Blok ini hanya
memindahkan aset JetSeller, menyimpan versi yang diganti, dan memegang lock yang
sama. Ia juga dapat memulihkan jika path aktif hilang setelah interupsi keras.

```bash
sudo bash <<'BASH'
set -Eeuo pipefail
exec 9>/run/lock/jetseller-static-deploy.lock
flock -n 9 || { echo 'BLOCKED: deployment lain masih berjalan'; exit 1; }
CADDY_DATA="$(docker inspect deploy_proxy_1 --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}')"
test -n "$CADDY_DATA" && test -d "$CADDY_DATA"
case "$CADDY_DATA" in /|/opt|/opt/gheverhan|/opt/gheverhan/deploy) exit 1;; esac
ACTIVE="$CADDY_DATA/landing/jetseller"
PREVIOUS='ISI_PATH_PREVIOUS_DARI_OUTPUT_RILIS'
[[ "$PREVIOUS" =~ ^"$CADDY_DATA/landing/jetseller.prev-"[0-9]{8}T[0-9]{6}Z$ ]]
test -d "$PREVIOUS" && test ! -L "$PREVIOUS" && test -s "$PREVIOUS/index.html"
SAVED="$CADDY_DATA/landing/jetseller.manual-rollback-$(date -u +%Y%m%dT%H%M%SZ)"
test ! -e "$SAVED" && test ! -L "$SAVED"
if [[ -e "$ACTIVE" || -L "$ACTIVE" ]]; then
  test -d "$ACTIVE" && test ! -L "$ACTIVE"
  mv -T -- "$ACTIVE" "$SAVED"
fi
mv -T -- "$PREVIOUS" "$ACTIVE" || {
  echo "CRITICAL: restore gagal; previous=$PREVIOUS saved=$SAVED" >&2
  exit 1
}
curl -fLsS --max-time 25 -o /dev/null https://jetseller.web.id/
curl -fLsS --max-time 25 https://gheverhan.store/api/v1/health
echo "Rollback aset selesai. Versi yang diganti (jika ada): $SAVED"
BASH
```

Jika previous tidak tersedia, hentikan blok ini. Arsip backup harus diverifikasi
dan diekstrak ke staging terpisah oleh operator sebelum pemulihan; jangan
mengekstraknya langsung menimpa aset aktif atau mengubah backend.

## Pemeriksaan tanpa VPS

```bash
bash -n landing/jetseller/deploy/release-v3-from-vps.sh
go test -v landing/jetseller/tests/release_templates_test.go
node --test landing/jetseller/tests/release.test.cjs
```

Go memakai parser `text/template` asli pada literal Docker di skrip dan runbook.
Tes Node menjalankan salinan skrip dengan path sementara serta pengganti
Docker/curl: tidak membutuhkan root, daemon Docker, jaringan, atau akses VPS.
