# Prisma 5 / Supavisor prepared statement compatibility

## Bukti dan root cause

Protected run `39873649870`, attempt2, pada main `7bb457e05cd46477b0764041d5f4a38187782e67`:

- MAINTENANCE_MODE=0 terverifikasi pada job setelah operator menyelaraskan GitHub variable (bukan aktivasi maintenance Vercel).
- Runtime transaction pooler / operator session pooler CONNECT, identity dan metadata PASS.
- Full preflight ditolak dengan P2010 / SQLSTATE42P05 (duplicate prepared statement), phase RELEASE_PREFLIGHT. Ini bukan TLS, password, migration SQL atau RLS failure.
- Operator mengonfirmasi DATABASE_URL GitHub belum memiliki `pgbouncer=true`.

Supabase mensyaratkan parameter tersebut pada port6543 untuk Prisma: https://supabase.com/docs/guides/database/prisma (bagian serverless deployments). Source native Prisma5.22: https://github.com/prisma/prisma-engines/blob/5.22.0/quaint/src/connector/postgres/native/mod.rs. Flag mengaktifkan compatibility protocol dan menonaktifkan statement cache. Backend transaction pooler dapat dipakai ulang oleh client lain; tanpa profil kompatibel, benturan dapat intermittent (attempt1 full metadata berhasil, attempt2 mendapat42P05). Tidak mengatribusikan statement sebelumnya ke client tertentu karena tidak ada bukti itu.

## Perbaikan source

App Prisma entrypoint menolak Supabase transaction URL port6543 yang tidak memiliki tepat satu `pgbouncer=true`; tidak memodifikasi URL atau mengubah credential/TLS/endpoint/schema. Preflight transport melakukan pemeriksaan setara sebelum membuka koneksi. DIRECT_URL tetap wajib direct/session; tidak dialihkan menjadi transaction pooler. Direct/session/local fixture tidak dipaksa menggunakan profil transaction.

Reject absent/false/wrong-case/nonboolean/duplicate flags; error tidak berisi DSN/role/password. Unit mencakup real application import yang harus gagal sebelum query/connection, immutable bindings, dan secret redaction. Tidak ada migration tambahan.

## Tindakan operator dan batas approval

1. Verifikasi metadata DATABASE_URL Vercel Production secara terpisah melalui workstation/dashboard tepercaya. Jangan mengasumsikan GitHub binding sama dengan effective deployment snapshot. Jangan menyalin secret ke Codex remote/chat/artifact.
2. Setelah target/profile dan approval perubahan konfigurasi tersedia, operator memperbaiki HANYA parameter kompatibilitas pada DATABASE_URL GitHub environment production-migration. Pertahankan ref bztprltkevacidcpjaam, database/schema, role/password, port, TLS dan parameter lain. Jika URL sudah memiliki query, tambahkan `&pgbouncer=true`; jangan menambahkan duplikat. Jangan mengubah DIRECT_URL atau merotasi password sebagai workaround.
3. Belum ada izin perubahan secret Vercel atau deployment. Jika Vercel juga belum kompatibel, siapkan controlled configuration/deployment yang mencakup client/writer lama. Menjalankan client baru kompatibel tidak membuktikan client lama/Preview terisolasi; jangan mencoba manual DEALLOCATE/terminate session.
4. Setelah konfigurasi yang disetujui siap, protected read-only preflight pada main reviewed perlu approval environment. PASS koneksi bukan PASS release: private bucket, schemaV2/ledger11, grants dan parity/writer gates tetap wajib.
5. Jangan rerun tanpa perubahan/proof baru. Jangan memakai role/endpoint alternatif, menurunkan TLS, mematikan gate schema/private Storage, atau mengubah ledger agar job hijau.

## PowerShell — metadata saja pada workstation operator tepercaya

Gunakan Vercel CLI resmi yang sudah login, Node22, tanpa debug/transcript. Command berikut hanya mem-parsing binding CURRENT project configuration di workstation operator: tidak membuka koneksi database, menyimpan .env, mengirim email atau mengubah Production. Ini BELUM membuktikan snapshot deployment historis atau role/grants runtime. Tinjau literal code sebelum menjalankannya; tidak menjalankan script/package repo dengan secret. Jangan menjalankannya di workspace Codex remote.

```powershell
$dsnMetadataPath = Join-Path ([IO.Path]::GetTempPath()) ("gheverhan-dsn-metadata-" + [guid]::NewGuid().ToString("N") + ".cjs")
$dsnMetadataCode = @'
try {
  const u = new URL(process.env.DATABASE_URL);
  const p = u.searchParams.getAll("pgbouncer");
  console.log(JSON.stringify({
    supabasePooler: u.hostname.endsWith(".pooler.supabase.com"),
    transactionPort: u.port === "6543",
    pgbouncerTrue: p.length === 1 && p[0] === "true",
    strictTlsRequested: u.searchParams.get("sslmode") === "require" && u.searchParams.get("sslaccept") === "strict"
  }));
} catch {
  console.log("BLOCKED: binding metadata unavailable");
  process.exitCode = 1;
}
'@
try {
  Set-Content -LiteralPath $dsnMetadataPath -Value $dsnMetadataCode -Encoding UTF8
  & vercel.cmd env run --environment production --project gheverhan --scope syauqi3 -- node.exe $dsnMetadataPath
  $dsnMetadataExit = $LASTEXITCODE
} finally {
  Remove-Item -LiteralPath $dsnMetadataPath -ErrorAction SilentlyContinue
}
if ($dsnMetadataExit -ne 0) { throw "BLOCKED: metadata command failed" }
```

File sementara di atas hanya berisi kode publik, tanpa secret. Secret tetap diinjeksi oleh CLI resmi ke proses Node; tidak ada penulisan `.env`. Penggunaan file `.cjs` menghindari perbedaan quoting native command pada Windows PowerShell 5.1 dan PowerShell 7.


Jika provider menolak akses secret, STOP; jangan mencoba bypass/credential alternatif. Operator memakai secret manager resmi/kanal provider yang sah dan hanya membagikan hasil boolean non-sensitif, bukan secret. Presence/boolean compatibility belum membuktikan ref/database/schema/role; probe reviewed lengkap tetap diperlukan.

Status: source guard bukan approval mengubah secret, menjalankan migration atau deployment. Full release tetap NO-GO sampai gate lain terpenuhi dan source final direview/CI PASS.
