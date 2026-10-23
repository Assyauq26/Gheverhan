# Prisma 5.22 runtime TLS CA — operator handoff (no Production changes)

## Scope

This patch applies an explicit CA trust file to PrismaClient's runtime db datasource. The protected GitHub Actions preflight already binds a CA independently; it does **not** configure a Vercel serverless function. The patch does not rewrite the stored DATABASE_URL, DIRECT_URL, disable verification, change credentials, or touch the database.

## Required operator steps before any Vercel test deployment

1. From **Supabase → Project Settings → Database → SSL Configuration**, obtain the actual database **server root CA** for bztprltkevacidcpjaam using the official dashboard. Verify the issuer and chain for the *actual connection target* (aws-0-ap-southeast-1.pooler.supabase.com, transaction pooler port 6543) before trusting it; if the CA is mismatched, stop. Never accept an intercepted/unverified CA or use rejectUnauthorized=false.
2. In the intended Vercel project syauqi3/gheverhan, configure sensitive SUPABASE_DB_CA_CERT for the **Production** environment using the trusted PEM (or its base64 encoding) via an authorized operator. This environment value is distinct from the GitHub Environment secret of the same name. Do not paste the PEM or database connection strings into PR comments, logs, or chat.
3. Ensure the intended deployment snapshot has the approved Supabase DATABASE_URL and correct pgbouncer=true compatibility flag for transaction port 6543; sslmode=require and sslaccept=strict must remain enabled. The runtime CA is attached through Prisma 5's sslcert, not sslrootcert; DIRECT_URL remains separate for Prisma migrations.
4. Run CI unit/security/typecheck/build tests for this PR. Review the exact commit, the Vercel target team, project, environment, and any preview/production writer isolation risks. Keep the PR draft and the domain's existing deployment unchanged until approvals.
5. Deploy a **controlled isolated test** (prefer staged Production deployment without alias assignment if testing Production-only env variables) only with operator release approval. On the new test URL, request /api/v1/products and review runtime diagnostics: TLS validation, authentication, SELECT 1/safe catalog read, pooler prepared-statement compatibility, correct project identity, and absence of leaked credentials. Do **not** treat READY or HTTP 200 from a static /health endpoint as proof of database connectivity.
6. If any TLS verification or host/issuer check fails, remain **NO-GO**. Do not relax TLS, change the CA indiscriminately, promote the test, change Storage privacy, or run migration to solve an unrelated transport problem.

## Code behavior

- Vercel VERCEL_ENV=production **fails closed** if CA is absent/malformed/expired, the expected Supabase target/port/flags don't match, or unsafe SSL override parameters are supplied.
- The CA is written privately (0600) under the writable system temp directory, bound to the Prisma Rust engine URL through the documented Prisma 5 sslcert query parameter, and retained for the serverless instance lifetime to support later re-connections.
- The stored environment connection string is not altered. Error messages omit connection strings, cert bytes, usernames and CA paths.
- Local development and Preview without an explicitly provided CA retain their existing behavior; providing a CA in either opts in to strict checking. Preview writer isolation remains a separate release gate.

References: https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql ; https://supabase.com/docs/guides/platform/ssl-enforcement .

## Tindak lanjut audit independen source — 23 Oktober 2026

Temuan P2 pada validasi target: `PostgresNativeUrl::host()` Prisma 5.22 mendahulukan query parameter `host` yang sudah di-decode daripada hostname utama URL. Helper c66bc98 hanya memvalidasi URL.hostname, sehingga pemeriksaan target dapat lolos sementara native engine memilih host jaringan atau Unix socket lain. Jalur ini memerlukan kontrol atas DSN server; bukan input request publik. Helper kini menolak seluruh parameter `host`, termasuk kosong dan key percent-encoded. Regression mereproduksi tiga kegagalan penolakan sebelum perbaikan; empat kasus baru kini ditolak sebelum pembuatan file CA/client. Credential, endpoint/port yang disetujui, flag TLS dan environment tersimpan tidak diubah.

Referensi: https://github.com/prisma/prisma-engines/blob/5.22.0/quaint/src/connector/postgres/url.rs (`host()` dan `parse_query_params()`).

Metadata read-only Vercel mengonfirmasi SUPABASE_DB_CA_CERT tersedia sebagai binding sensitive khusus Production pada syauqi3/gheverhan. Presence tidak membuktikan isi sertifikat, issuer, atau kecocokannya dengan chain pooler. Nilai secret tidak diambil. Executor ini tidak memiliki TCP grant untuk port PostgreSQL; handshake TLS tanpa credential secara independen tetap BLOCKED di sini. Tidak ada bypass proxy/policy atau penerimaan sertifikat tidak aman. Verifikasi CA yang dikonfigurasi terhadap server aktual tetap merupakan gate runtime/operator.

Audit source bukan persetujuan operasional. Snapshot c66bc98 belum memiliki approval reviewer independen di GitHub. HEAD perbaikan memerlukan CI baru dan review independen, kemudian persetujuan eksplisit untuk deployment uji protected `--prod --skip-domain` pada exact SHA tersebut. Jangan memakai CI c66bc98 sebagai bukti source baru; jangan merge PR ini/#87, mengubah secret/database/Storage atau promote.

### Probe TLS-only Windows untuk operator (tanpa credential atau SQL)

Jalankan hanya pada workstation operator tepercaya dengan OpenSSL yang sudah tersedia dan root CA resmi yang diunduh dari dashboard Supabase. Jangan mengambil nilai Secret Vercel atau menempelkan isi sertifikat/DSN ke chat. Host tetap mengikuti endpoint yang diizinkan patch; pengujian kedua port tidak membuktikan port yang dipakai snapshot Vercel. Probe mengirim PostgreSQL SSLRequest dan memverifikasi TLS/hostname tanpa username/password database atau SQL. Tidak ada flag TLS tidak aman, perubahan environment, atau penulisan konfigurasi provider.

```powershell
$officialCaFile = Read-Host "Local path to the official Supabase root CA file"
if (-not (Test-Path -LiteralPath $officialCaFile -PathType Leaf)) { throw "BLOCKED: official CA file unavailable" }
$poolerHost = "aws-0-ap-southeast-1.pooler.supabase.com"
foreach ($poolerPort in @(5432, 6543)) {
    "" | & openssl.exe s_client -starttls postgres -connect ($poolerHost + ":" + $poolerPort) -servername $poolerHost -CAfile $officialCaFile -verify_return_error -verify_hostname $poolerHost -brief 2>&1 |
        Select-String -Pattern "Verification: OK|Verification error|verify error|Protocol version|Ciphersuite"
    if ($LASTEXITCODE -ne 0) { throw ("BLOCKED: TLS verification failed on port " + $poolerPort) }
    Write-Output ("TLS handshake PASS on port " + $poolerPort)
}
```

Command disiapkan untuk PowerShell dan belum dijalankan pada workstation operator. Hasil TLS-only membuktikan kompatibilitas trust/hostname dengan file CA lokal tersebut; bukan autentikasi role database, kesamaan isi Secret Vercel, atau keberhasilan query Prisma. Pengujian API read-only aktual tetap wajib sesudah review exact SHA dan persetujuan deployment.
