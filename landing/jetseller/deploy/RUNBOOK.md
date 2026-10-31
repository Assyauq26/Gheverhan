# RUNBOOK — JetSeller landing page (Opsi B, draft)

Status: **DRAFT ONLY**. Jalankan hanya setelah persetujuan deployment terpisah.
Target: static `file_server` pada Caddy existing, tanpa container baru, tanpa app/db.

## 0. Konteks eksekusi — jangan mencampur shell

Dokumen ini memakai dua konteks berbeda. Variabel shell tidak bertahan ketika
sesi SSH ditutup. Semua langkah mutasi mulai langkah 3 harus dijalankan dalam
satu sesi Bash VPS yang sama, atau diawali ulang dengan blok bootstrap konteks.

| Tanda | Konteks | Contoh |
|---|---|---|
| `[PS-WIN]` | PowerShell di Windows lokal | `ssh`, `scp`, `gh`, tes HTTPS dari Windows |
| `[BASH-VPS]` | Terminal Ubuntu di VPS (`ssh gheverhan-vps`) | `sudo`, `docker`, `tar`, `rsync` server-side |

Aturan wajib:

- Blok `[PS-WIN]` hanya dijalankan di PowerShell Windows. Sintaksnya memakai `ssh gheverhan-vps` (alias dari `~/.ssh/config`) dan path Windows lokal.
- Blok `[BASH-VPS]` hanya dijalankan setelah masuk ke VPS (`ssh gheverhan-vps`). Perintah `sudo`/`docker`/`tar` server-side tidak valid di PowerShell.
- Jangan menjalankan whole dokumen dari satu terminal. Salin blok sesuai labelnya.
- Jangan memakai operator Bash (`&&`, `\;`, `\` sambungan) di PowerShell, atau operator PowerShell (`$env:`, backtick) di Bash.

## 1. [PS-WIN] Pre-flight read-only dari Windows

```powershell
ssh -o BatchMode=yes gheverhan-vps "whoami && hostname && uptime"
curl.exe --fail --silent --show-error https://gheverhan.store/api/v1/health
curl.exe --fail --silent --show-error -I https://gheverhan.store/
$gh = 'C:\Program Files\GitHub CLI\gh.exe'
& $gh variable get HELI_POD_AUTODEPLOY -R Assyauq26/Gheverhan
```

Ekspektasi: user `ubuntu`, `HELI_POD_AUTODEPLOY = disabled`, health `gheverhan.store` mengembalikan JSON `status: ok`.

## 2. [BASH-VPS] Masuk VPS dan tetapkan $CADDY_DATA dari mount terverifikasi

Masuk ke VPS terlebih dahulu:

```bash
ssh gheverhan-vps
```

Di dalam terminal Ubuntu, jalankan:

```bash
sudo -n docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
sudo -n docker inspect deploy_proxy_1 --format '{{range .Mounts}}{{.Source}} -> {{.Destination}} ({{.Mode}}){{println}}'
```

Catat `Source` pada baris dengan `Destination` persis `/data`. Tetapkan variabel hanya dari nilai yang benar-benar terbaca, lalu verifikasi tidak kosong:

```bash
CADDY_DATA=$(sudo -n docker inspect deploy_proxy_1 --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}')

if [ -z "$CADDY_DATA" ] || [ ! -d "$CADDY_DATA" ]; then
  echo "FATAL: CADDY_DATA kosong atau tidak ada: '$CADDY_DATA'" >&2
  exit 1
fi

echo "CADDY_DATA=$CADDY_DATA"
sudo -n test -d "$CADDY_DATA" || { echo "FATAL: CADDY_DATA tidak dapat diakses" >&2; exit 1; }
```

Aturan keras:

- `$CADDY_DATA` **tidak boleh** ditulis manual dari memori/dokumentasi lama; harus berasal dari output `docker inspect` di sesi yang sama.
- Jika perintah di atas berhenti (exit 1), **hentikan seluruh prosedur**. Jangan lanjut ke backup/upload.
- Variabel ini hilang saat sesi SSH baru dimulai; ulangi bootstrap konteks sebelum
  langkah 3, 5, atau 8 jika sesi berubah.

Bootstrap konteks wajib untuk sesi VPS baru:

```bash
set -u
CADDY_DATA=$(sudo -n docker inspect deploy_proxy_1 --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}')
if [ -z "$CADDY_DATA" ] || [ ! -d "$CADDY_DATA" ]; then echo "FATAL: CADDY_DATA kosong/tidak ada" >&2; exit 1; fi
TS=${TS:-$(date +%Y%m%d-%H%M%S)}
ACTIVE="$CADDY_DATA/landing/jetseller"
PREV="$CADDY_DATA/landing/jetseller.prev-$TS"
BACKUP_CADDY="/opt/gheverhan/deploy/Caddyfile.bak-$TS"
BACKUP_ASSET="/opt/gheverhan/deploy/landing-jetseller-$TS.tgz"
case "$CADDY_DATA" in /|/opt|/opt/gheverhan|/opt/gheverhan/deploy) echo "FATAL: CADDY_DATA tidak aman" >&2; exit 1;; esac
test "$ACTIVE" = "$CADDY_DATA/landing/jetseller" || { echo "FATAL: ACTIVE tidak aman" >&2; exit 1; }
sudo -n test -d "$CADDY_DATA" || { echo "FATAL: CADDY_DATA tidak dapat diakses" >&2; exit 1; }
printf 'Context OK: CADDY_DATA=%s ACTIVE=%s PREV=%s TS=%s\n' "$CADDY_DATA" "$ACTIVE" "$PREV" "$TS"
```

Gunakan nilai `TS`, `BACKUP_CADDY`, `BACKUP_ASSET`, `ACTIVE`, dan `PREV` yang
sama untuk langkah 3, 5, dan 8. Jangan membuat timestamp baru di tengah prosedur.

Periksa kapasitas sebelum menyentuh aset:

```bash
df -h /
free -h
```

## 3. [BASH-VPS] Backup wajib dan terverifikasi

Backup gagal = deployment berhenti. Tidak ada pengabaian error pada langkah backup.

```bash
TS=${TS:-$(date +%Y%m%d-%H%M%S)}
BACKUP_CADDY="/opt/gheverhan/deploy/Caddyfile.bak-$TS"
BACKUP_ASSET="/opt/gheverhan/deploy/landing-jetseller-$TS.tgz"
ACTIVE="$CADDY_DATA/landing/jetseller"
PREV="$CADDY_DATA/landing/jetseller.prev-$TS"

case "$CADDY_DATA" in /|/opt|/opt/gheverhan|/opt/gheverhan/deploy) echo "FATAL: CADDY_DATA tidak aman" >&2; exit 1;; esac
test -n "$TS" || { echo "FATAL: TS kosong" >&2; exit 1; }
test -d "$CADDY_DATA" || { echo "FATAL: CADDY_DATA tidak ada" >&2; exit 1; }
test "$ACTIVE" = "$CADDY_DATA/landing/jetseller" || { echo "FATAL: ACTIVE tidak aman" >&2; exit 1; }

sudo cp -a /opt/gheverhan/deploy/Caddyfile "$BACKUP_CADDY"
sudo test -s "$BACKUP_CADDY" || { echo "FATAL: backup Caddyfile gagal" >&2; exit 1; }

if [ -d "$ACTIVE" ]; then
  sudo tar -czf "$BACKUP_ASSET" -C "$CADDY_DATA/landing" jetseller
  sudo test -s "$BACKUP_ASSET" || { echo "FATAL: backup aset gagal" >&2; exit 1; }
  sudo tar -tzf "$BACKUP_ASSET" >/dev/null || { echo "FATAL: arsip aset korup" >&2; exit 1; }
else
  echo "INFO: $ACTIVE belum ada (deployment pertama) — backup aset dilewati secara eksplisit."
fi

ls -lh "$BACKUP_CADDY"
if [ -f "$BACKUP_ASSET" ]; then ls -lh "$BACKUP_ASSET"; fi
echo "Backup siap: $BACKUP_CADDY"
```

Keberhasilan backup dipaksa oleh `test -s` dan `tar -tzf`; jika salah satu gagal, prosedur berhenti.

## 4. [PS-WIN] Upload ke staging server (dari Windows)

Kembali ke PowerShell Windows. Upload hanya aset runtime; `deploy/` dan `tests/` tidak ikut.
Staging lama dibersihkan dan staging baru dibuat **sebelum** SCP; ini hanya
menyentuh `/tmp`, bukan aset Production.

```powershell
cd "$env:USERPROFILE\Projects\Gheverhan"
ssh gheverhan-vps "rm -rf /tmp/jetseller-staging && mkdir -p /tmp/jetseller-staging && test -d /tmp/jetseller-staging"
scp -r landing\jetseller\index.html landing\jetseller\404.html gheverhan-vps:/tmp/jetseller-staging/
scp -r landing\jetseller\daftar landing\jetseller\masuk landing\jetseller\assets gheverhan-vps:/tmp/jetseller-staging/
ssh gheverhan-vps "find /tmp/jetseller-staging -type f -print | sort"
```

Jika `scp` gagal di tengah jalan, staging server tidak lengkap: hapus dan ulangi, jangan lanjut ke langkah 5.

```powershell
ssh gheverhan-vps "rm -rf /tmp/jetseller-staging && test ! -e /tmp/jetseller-staging"
```

## 5. [BASH-VPS] Pertukaran aset atomik (aset aktif tidak dihapus sebelum pengganti siap)

Di terminal Ubuntu:

```bash
test -n "$CADDY_DATA" && test -d "$CADDY_DATA" || { echo "FATAL: konteks CADDY_DATA hilang" >&2; exit 1; }
test -n "$TS" || { echo "FATAL: konteks TS hilang" >&2; exit 1; }
test "$ACTIVE" = "$CADDY_DATA/landing/jetseller" || { echo "FATAL: ACTIVE tidak aman" >&2; exit 1; }
test "$PREV" = "$CADDY_DATA/landing/jetseller.prev-$TS" || { echo "FATAL: PREV/TS tidak konsisten" >&2; exit 1; }
sudo rm -rf "$CADDY_DATA/landing/jetseller.new"
sudo mkdir -p "$CADDY_DATA/landing/jetseller.new"
sudo rsync -a --delete /tmp/jetseller-staging/ "$CADDY_DATA/landing/jetseller.new/"
sudo chown -R root:root "$CADDY_DATA/landing/jetseller.new"
sudo find "$CADDY_DATA/landing/jetseller.new" -type d -exec chmod 755 {} \;
sudo find "$CADDY_DATA/landing/jetseller.new" -type f -exec chmod 644 {} \;

# Verifikasi staging lengkap sebelum menyentuh aset aktif
for f in index.html 404.html daftar/index.html masuk/index.html assets/css/main.css assets/js/main.js assets/img/favicon.svg; do
  sudo test -f "$CADDY_DATA/landing/jetseller.new/$f" || { echo "FATAL: staging tidak lengkap: $f" >&2; exit 1; }
done

# Lindungi aset aktif yang sedang live; jangan pernah rm aset aktif di sini
if [ -d "$ACTIVE" ]; then
  sudo rm -rf "$PREV"
  sudo mv "$ACTIVE" "$PREV"
fi
sudo mv "$CADDY_DATA/landing/jetseller.new" "$ACTIVE"
sudo test -f "$ACTIVE/index.html" || { echo "FATAL: aset baru tidak terpasang" >&2; exit 1; }
echo "Aset aktif terpasang. Versi sebelumnya: $PREV (jika ada)."
sudo rm -rf /tmp/jetseller-staging
sudo test ! -e /tmp/jetseller-staging || { echo "FATAL: staging gagal dibersihkan" >&2; exit 1; }
```

Prinsip: `$ACTIVE` hanya dipindahkan (rename, operasi atomik satu filesystem) setelah staging terverifikasi. Tidak ada `rm -rf` terhadap direktori aktif.

## 6. [BASH-VPS] Terapkan Caddyfile aditif dan validasi

Jangan menyalin seluruh `Caddyfile.jetseller.DRAFT` ke VPS. Draft lengkap
memuat blok existing Gheverhan hanya sebagai konteks referensi. Tambahkan
hanya dua blok aditif berikut ke Caddyfile existing VPS:

1. `www.jetseller.web.id` — redirect ke apex.
2. `jetseller.web.id` — static `file_server` pada `/data/landing/jetseller`.

Jangan menyalin ulang atau mengedit blok `gheverhan.store` dan
`www.gheverhan.store`.

```bash
sudo docker exec deploy_proxy_1 caddy validate \
  --config /etc/caddy/Caddyfile --adapter caddyfile
```

Jika validasi gagal, jalankan rollback (langkah 8) sebelum tindakan lain.

## 7. [BASH-VPS] Reload graceful dan smoke test

```bash
sudo docker exec deploy_proxy_1 caddy reload \
  --config /etc/caddy/Caddyfile --adapter caddyfile
```

Ini reload konfigurasi tanpa restart seluruh stack. Jangan memakai `docker restart`, `docker compose down`, atau migrasi.

Dari terminal yang sama (Bash) atau PowerShell (`curl.exe`), hasil harus sama:

```bash
curl --fail --silent --show-error -o /dev/null -w 'jetseller=%{http_code}\n' https://jetseller.web.id/
curl --silent --show-error -o /dev/null -w 'www=%{http_code} redirect=%{redirect_url}\n' https://www.jetseller.web.id/
curl --silent --show-error -o /dev/null -w 'http=%{http_code} redirect=%{redirect_url}\n' http://jetseller.web.id/
curl --fail --silent --show-error -o /dev/null -w 'unknown=%{http_code}\n' https://jetseller.web.id/tidak-ada-xyz
curl --fail --silent --show-error -o /dev/null -w 'gheverhan=%{http_code}\n' https://gheverhan.store/
curl --fail --silent --show-error https://gheverhan.store/api/v1/health
```

Ekspektasi:

- JetSeller apex: `200`
- JetSeller www: redirect ke apex
- JetSeller HTTP: redirect ke HTTPS
- URL tidak dikenal: `404`, bukan landing `200`
- Gheverhan apex: `200` dan health JSON `status: ok`

## 8. [BASH-VPS] Rollback (menggunakan backup terverifikasi)

Syarat rollback aman: `$BACKUP_CADDY` ada dan hasil `test -s` sebelumnya hijau. Aset aktif juga **tidak dihapus** sebelum versi lama siap dipasang kembali.

```bash
test -n "$CADDY_DATA" && test -d "$CADDY_DATA" || { echo "FATAL: konteks CADDY_DATA hilang" >&2; exit 1; }
test -n "$TS" && test -n "$BACKUP_CADDY" && test -n "$BACKUP_ASSET" || { echo "FATAL: konteks backup/TS hilang" >&2; exit 1; }
test -n "$BACKUP_CADDY" && test -s "$BACKUP_CADDY" || { echo "FATAL: backup Caddyfile tidak ditemukan" >&2; exit 1; }
test "$ACTIVE" = "$CADDY_DATA/landing/jetseller" || { echo "FATAL: ACTIVE tidak aman" >&2; exit 1; }
test "$PREV" = "$CADDY_DATA/landing/jetseller.prev-$TS" || { echo "FATAL: PREV/TS tidak konsisten" >&2; exit 1; }
sudo test -s "$BACKUP_CADDY" || { echo "FATAL: backup Caddyfile tidak ditemukan" >&2; exit 1; }
sudo cp -a "$BACKUP_CADDY" /opt/gheverhan/deploy/Caddyfile
sudo docker exec deploy_proxy_1 caddy validate \
  --config /etc/caddy/Caddyfile --adapter caddyfile
sudo docker exec deploy_proxy_1 caddy reload \
  --config /etc/caddy/Caddyfile --adapter caddyfile

if [ -d "$PREV" ]; then
  sudo rm -rf "$CADDY_DATA/landing/jetseller.rollback"
  sudo mv "$ACTIVE" "$CADDY_DATA/landing/jetseller.rollback"
  sudo mv "$PREV" "$ACTIVE"
  sudo rm -rf "$CADDY_DATA/landing/jetseller.rollback"
elif [ -f "$BACKUP_ASSET" ]; then
  sudo rm -rf "$CADDY_DATA/landing/jetseller.restore"
  sudo mkdir -p "$CADDY_DATA/landing/jetseller.restore"
  sudo tar -xzf "$BACKUP_ASSET" -C "$CADDY_DATA/landing/jetseller.restore"
  sudo rm -rf "$CADDY_DATA/landing/jetseller.rollback"
  sudo mv "$ACTIVE" "$CADDY_DATA/landing/jetseller.rollback"
  sudo mv "$CADDY_DATA/landing/jetseller.restore/jetseller" "$ACTIVE"
  sudo rm -rf "$CADDY_DATA/landing/jetseller.rollback"
else
  echo "INFO: tidak ada versi aset sebelumnya (rollback deployment pertama) — kosongkan aset aktif."
  sudo rm -rf "$ACTIVE"
fi

curl --fail --silent --show-error https://gheverhan.store/api/v1/health
```

Catatan: baris `sudo rm -rf "$ACTIVE"` terakhir hanya terjangkau pada rollback deployment pertama, ketika tidak ada versi aset sebelumnya untuk dikembalikan — pada titik itu menghapus aset yang baru dipasang memang tujuan rollback.

## Larangan

- Jangan restart atau menghapus container.
- Jangan menjalankan migrasi, seed, atau deployment app.
- Jangan membaca `.env`, private key, atau secrets.
- Jangan mengubah routing Gheverhan.
- Jangan menambahkan wildcard JetSeller.
- Jangan mengaktifkan `HELI_POD_AUTODEPLOY`.
- Jangan pernah menjalankan `rm -rf` pada direktori aset aktif sebagai bagian dari pertukaran normal.
