# Gheverhan Sprint 2E — Supabase Storage rollout

Status: code review / **not live-certified**. This change introduces a server-only Supabase Storage REST adapter without a dependency or Prisma migration. **Do not merge/deploy as storage-ready until the following manual setup and security checks pass.**

## Buckets (Supabase project `bztprltkevacidcpjaam`)

Create in **Supabase Dashboard → Storage** (first on an isolated staging project, NOT in the shared live database without approval):

| Bucket name | Visibility | Suggested limits |
| --- | --- | --- |
| `product-images` | Public read; private server write | 4 MiB application limit; bucket currently permits 5 MiB, image/jpeg, image/png, image/webp |
| `payment-proofs` | Private, no public URLs | 4 MiB application limit; bucket currently permits 5 MiB, image/jpeg, image/png, image/webp, application/pdf |

The application writes and reads only via protected Next.js API/Server Action routes using the service-role key. Do not allow anonymous/authenticated clients to insert, update or delete `storage.objects` for these buckets. Never add browser-facing policies that grant access to `payment-proofs`. A public product image URL can be fetched without a login if someone obtains the object path, even for draft products: never upload confidential imagery to the public bucket.

## Vercel (Settings → Environment Variables)

Add **server-only** values to an isolated Preview environment first:

- `SUPABASE_URL` — `https://bztprltkevacidcpjaam.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` — privileged service_role key from your Supabase project's API Keys page. **Never paste into chat, logs, commits, or client bundles; never prefix with NEXT_PUBLIC_.**
- `SUPABASE_PRODUCT_IMAGES_BUCKET` — `product-images`
- `SUPABASE_PAYMENT_PROOFS_BUCKET` — `payment-proofs`
- `STORAGE_APP_NAME` — `gheverhan` (default; do not silently change existing paths)

The adapter fails closed if essential credentials are missing. Legacy `EMERGENT_LLM_KEY` and `INTEGRATION_PROXY_URL` no longer power uploads. Store keys using sensitive environment variables, rotate if exposed, and redeploy only after reviewing target environment scopes. Staging must not use production credentials/customer data.

## Object and data lifecycle

- Paths remain `gheverhan/product-images/{productId}/{uuid}.{jpg,png,webp}` and `gheverhan/payment-proofs/{userId}/{uuid}.{jpg,png,webp,pdf}`; they are stored as internal references, not signed URLs.
- Product images are still served by `/api/v1/product-images/{id}` after database visibility/RBAC verification. The direct public Supabase bucket is separately accessible, so drafts are not truly confidential.
- Payment proofs are private: `/api/v1/admin/payments/proof?id={confirmationId}` checks payment.read; `/api/v1/payments/proof?id={confirmationId}` checks owner. No raw object path accepted from callers. Return `no-store`, `nosniff`, `sandbox` headers.
- The server validates declared MIME plus file magic, size, order ownership/state, and product edit permissions before storing. The transaction layer rechecks payment state/ownership under locking.
- If storage succeeds but the database write fails, remove the newly created object best-effort. If cleanup fails, a generic server error is logged for operator investigation. Deleting a product image after a successful product edit similarly attempts post-commit cleanup; previous order-referenced images remain protected by existing DB invariants.
- Existing production data at inspection consisted of **10 external HTTPS product image records**, not managed Emergent objects. Existing HTTPS URLs remain unchanged. Older Emergent-managed `/api/v1/product-images/{id}?object=...` records would need a reviewed object migration to Supabase first; **the new adapter cannot retrieve Emergent objects automatically**. Never delete old objects until references are verified.

## Tests and limitations

1. Run `npm ci && npm run prisma:generate && npm run typecheck && npm run lint && npm run build` from `frontend`.
2. Run `npm test`, `npm run test:containment`, the three `test:integration:*` commands, `npm run test:e2e:products`, `npm run test:e2e:operations`, and the navigation browser test, with isolated loopback PostgreSQL `gheverhan_sprint1_test`. Browser tests use a loopback-only Supabase REST contract double.
3. When an isolated Supabase Storage staging project is connected, upload a real PNG image, read it on a published product, remove a draft image, upload a synthetic transfer proof, check admin/customer ownership denial, verify storage path isolation and confirm that the private bucket cannot be opened anonymously. Do not make a real money transfer or mutate live order data.
4. **Deployment body size**: Vercel Functions have a 4.5 MB request/response payload limit. The application now enforces **4 MiB (4,194,304 bytes)** per file on server and UI, with 128 KiB multipart overhead headroom; the Server Action body limit is 4.25 MB. Buckets currently allow 5 MiB, but the app is stricter, so no production bucket mutation is needed for this sprint. Test a real **4 MiB upload** and multipart response on Vercel before claiming the exact maximum is reliable. Larger files need a separately approved direct-to-Supabase signed upload flow.
5. The REST contract mocks and CI passes do not establish actual Supabase bucket policies, storage quotas, operator recovery for orphan cleanup, or live serverless latency. Complete a staging smoke test before calling Sprint 2E live-ready.

## Rollout gates

- [ ] Staging buckets created with correct public/private settings.
- [ ] Preview-only service-role secret and URL configured securely.
- [ ] All GitHub Actions, build, containment, DB regression and browser tests pass.
- [ ] Real staging object PUT/GET/DELETE smoke test passes.
- [ ] Unauthorized access to payment proof and image writes denied.
- [ ] Manual bank account present to test checkout (fake account on staging only).
- [ ] Check the 4 MiB application cap with full multipart overhead and Vercel request/response limitations.
- [ ] Maintainer approves production bucket/secret configuration and merge.

**No data/schema changes or production bucket mutations are performed by this PR.**
