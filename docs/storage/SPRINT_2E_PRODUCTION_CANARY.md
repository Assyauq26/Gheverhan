# Sprint 2E — Production Storage Canary (Manual, No Real Orders)

**Status:** checklist prepared; no production objects uploaded by automation.
**PR:** #26 (Draft), **scope:** bucket I/O and public/private access behavior without creating an order, transaction, or product.

## Why manual

The connected Supabase tool can query database and bucket metadata but cannot upload physical Storage objects. The connected Vercel service-role environment variable is marked **Sensitive/Secret**, so its value cannot be recovered and **must not** be copied to an untrusted PR Preview, action, chat or local test process. The required live PUT/GET/DELETE test must therefore use **Supabase Studio Storage UI** or a separately approved isolated credential-bearing runtime. Do not implement a temporary privileged public endpoint.

## Synthetic fixtures

Test PNGs are generated in the conversation's sandbox, and contain no customer data.

| Filename | Bytes | SHA-256 prefix | Upload |
| --- | ---: | --- | --- |
| `gheverhan-canary-small.png` | 5,024 | `35071b5fc6c8d903f755b6cb` | both buckets |
| `gheverhan-canary-near-4MiB.png` | 4,179,839 | `94ca921b72bea70c3c61ec69` | product-images only |

Use exactly these names at the bucket **root** so that the SQL checks and test URLs below match; ensure no object with either name exists before beginning.

## Preflight (already verified read-only)

- `product-images`: public read, bucket limit 5 MiB, JPEG/PNG/WebP allowed.
- `payment-proofs`: private, bucket limit 5 MiB, JPEG/PNG/WebP/PDF allowed.
- No additional `storage.objects` policies and no objects in either bucket at inspection.
- Application upload cap 4 MiB is stricter than Supabase bucket 5 MiB.
- Never modify or delete real product/order/payment objects.

## Production canary using Supabase Dashboard

1. Supabase Dashboard → Gheverhan → Storage → **product-images**.
2. Upload both synthetic PNGs into the bucket root, retaining their names. Confirm UI success.
3. In an incognito browser test a public GET to:
   - `https://bztprltkevacidcpjaam.supabase.co/storage/v1/object/public/product-images/gheverhan-canary-small.png`
   - `https://bztprltkevacidcpjaam.supabase.co/storage/v1/object/public/product-images/gheverhan-canary-near-4MiB.png`
   Each should return the intended image.
4. Dashboard → Storage → **payment-proofs**. Upload the small PNG only.
5. Try an unauthenticated/incognito GET to:
   - `https://bztprltkevacidcpjaam.supabase.co/storage/v1/object/public/payment-proofs/gheverhan-canary-small.png`
   This **must fail**; do not enable Public or permissive storage RLS policies.
6. Inspect the three objects through the read-only SQL below, then **delete only these named canary objects via Supabase Storage UI**. Supabase warns SQL deletion of `storage.objects` leaves orphaned bytes.
7. Run the SQL check again. The expected result is **zero canary rows**. Save screenshots/error codes but never API keys.

Read-only query:

```sql
SELECT bucket_id, name, (metadata->>'size')::bigint AS bytes,
       created_at
FROM storage.objects
WHERE (bucket_id = 'product-images'
  AND name IN ('gheverhan-canary-small.png', 'gheverhan-canary-near-4MiB.png'))
   OR (bucket_id = 'payment-proofs'
  AND name = 'gheverhan-canary-small.png')
ORDER BY bucket_id, name;
```

Expected after upload: exactly three rows, with sizes 5,024 / 4,179,839 / 5,024 bytes. After cleanup: `[]`.

## Limits of this test

Supabase Studio UI writes authenticate as the dashboard operator and **do not exercise the Next.js server adapter** with the Vercel Production `SUPABASE_SERVICE_ROLE_KEY`. The near-4MiB image upload via Dashboard also does **not** test Vercel's 4.5 MB request/response restriction.

Final authorization for production requires maintainers to explicitly accept post-merge Vercel application canary with instant rollback for new upload failures; alternatives are a tightly controlled production-credential CLI run that does not expose the key, or an isolated staging project. Keep PR #26 Draft until the desired release gate is agreed.

**Never insert/delete `storage.objects` directly via SQL.**
