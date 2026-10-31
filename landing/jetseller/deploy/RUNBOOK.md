# RUNBOOK — JetSeller landing page (Opsi B, draft)

Status: **DRAFT ONLY**. Jalankan hanya setelah persetujuan deployment terpisah.
Target: static `file_server` pada Caddy existing, tanpa container baru, tanpa app/db.

## 0. Pre-flight read-only

```bash
ssh -o BatchMode=yes gheverhan-vps "whoami && hostname && uptime"
ssh -o BatchMode=yes gheverhan-vps \
  "sudo -n docker ps --format 'table {{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}'"
ssh -o BatchMode=yes gheverhan-vps \
  "sudo -n docker inspect deploy_proxy_1 --format '{{range .Mounts}}{{.Source}} -> {{.Destination}} ({{.Mode}}){{println}}'"
```

Wajib verifikasi mount dengan destination `/data` dan catat `Source` aktual.
Jangan mengasumsikan nama volume/path dari audit sebelumnya.

```bash
curl --fail --silent --show-error https://gheverhan.store/api/v1/health
curl --fail --silent --show-error -I https://gheverhan.store/
getent hosts jetseller.web.id
gh variable list -R Assyauq26/Gheverhan
sudo -n df -h /
sudo -n free -h
```

Berhenti jika SSH, `sudo -n`, health Gheverhan, DNS, atau mount gagal.

## 1. Backup

```bash
TS=$(date +%Y%m%d-%H%M%S)
sudo cp -a /opt/gheverhan/deploy/Caddyfile \
  "/opt/gheverhan/deploy/Caddyfile.bak-$TS"
sudo mkdir -p "$CADDY_DATA/landing"
sudo tar -czf "/opt/gheverhan/deploy/landing-jetseller-$TS.tgz" \
  -C "$CADDY_DATA" landing 2>/dev/null || true
```

Jangan membaca `.env`, private key, atau file secret apa pun.

## 2. Upload aset secara atomik

Upload hanya aset berikut ke staging, bukan draft deployment atau evidence:

```text
index.html
404.html
daftar/index.html
masuk/index.html
assets/
```

Contoh prosedur aman setelah `$CADDY_DATA` diverifikasi:

```bash
rsync -avz --delete \
  --exclude='deploy/' --exclude='tests/' \
  landing/jetseller/ \
  ubuntu@VPS:/tmp/jetseller-staging/

sudo rm -rf "$CADDY_DATA/landing/jetseller.new"
sudo mkdir -p "$CADDY_DATA/landing/jetseller.new"
sudo rsync -a --delete /tmp/jetseller-staging/ \
  "$CADDY_DATA/landing/jetseller.new/"
sudo chown -R root:root "$CADDY_DATA/landing/jetseller.new"
sudo find "$CADDY_DATA/landing/jetseller.new" -type d -exec chmod 755 {} \;
sudo find "$CADDY_DATA/landing/jetseller.new" -type f -exec chmod 644 {} \;
sudo mv "$CADDY_DATA/landing/jetseller" \
  "$CADDY_DATA/landing/jetseller.prev-$TS" 2>/dev/null || true
sudo mv "$CADDY_DATA/landing/jetseller.new" \
  "$CADDY_DATA/landing/jetseller"
rm -rf /tmp/jetseller-staging
```

`VPS` adalah placeholder yang harus diganti dengan host operasional yang disetujui.

## 3. Terapkan Caddyfile aditif

Salin blok dari `Caddyfile.jetseller.DRAFT` ke **akhir** Caddyfile VPS.
Jangan mengubah blok `gheverhan.store` atau `www.gheverhan.store`.

```bash
sudo docker exec deploy_proxy_1 caddy validate \
  --config /etc/caddy/Caddyfile --adapter caddyfile
```

Jika validasi gagal, pulihkan backup sebelum tindakan lain.

## 4. Reload graceful

```bash
sudo docker exec deploy_proxy_1 caddy reload \
  --config /etc/caddy/Caddyfile --adapter caddyfile
```

Ini reload konfigurasi tanpa restart seluruh stack. Jangan memakai `docker restart`,
`docker compose down`, atau migrasi.

## 5. HTTPS dan smoke test

```bash
curl --fail --silent --show-error -o /dev/null \
  -w 'jetseller=%{http_code}\n' https://jetseller.web.id/
curl --silent --show-error -o /dev/null \
  -w 'www=%{http_code} redirect=%{redirect_url}\n' \
  https://www.jetseller.web.id/
curl --silent --show-error -o /dev/null \
  -w 'http=%{http_code} redirect=%{redirect_url}\n' \
  http://jetseller.web.id/
curl --fail --silent --show-error -o /dev/null \
  -w 'gheverhan=%{http_code}\n' https://gheverhan.store/
curl --fail --silent --show-error \
  https://gheverhan.store/api/v1/health
```

Ekspektasi:

- JetSeller apex: `200`
- JetSeller www: redirect ke apex
- JetSeller HTTP: redirect ke HTTPS
- Gheverhan apex: `200`
- Gheverhan health: JSON `status: ok`
- URL tidak dikenal: `404`, bukan landing `200`

## 6. Rollback

```bash
sudo cp -a "/opt/gheverhan/deploy/Caddyfile.bak-$TS" \
  /opt/gheverhan/deploy/Caddyfile
sudo docker exec deploy_proxy_1 caddy validate \
  --config /etc/caddy/Caddyfile --adapter caddyfile
sudo docker exec deploy_proxy_1 caddy reload \
  --config /etc/caddy/Caddyfile --adapter caddyfile
sudo rm -rf "$CADDY_DATA/landing/jetseller"
sudo mv "$CADDY_DATA/landing/jetseller.prev-$TS" \
  "$CADDY_DATA/landing/jetseller" 2>/dev/null || true
```

Verifikasi ulang health `gheverhan.store` setelah rollback.

## Larangan

- Jangan restart atau menghapus container.
- Jangan menjalankan migrasi, seed, atau deployment app.
- Jangan membaca `.env`, private key, atau secrets.
- Jangan mengubah routing Gheverhan.
- Jangan menambahkan wildcard JetSeller.
- Jangan mengaktifkan `HELI_POD_AUTODEPLOY`.
