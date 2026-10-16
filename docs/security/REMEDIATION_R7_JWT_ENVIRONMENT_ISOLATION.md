# Remediation R7 — JWT isolation between Preview and Production

## Status (2026-10-16)
Vercel project `gheverhan` currently has one `JWT_SECRET` entry scoped to both
`production` and `preview` (metadata-only check; values were **not** read).
`DATABASE_URL` and `DIRECT_URL` are also shared. These are separate blockers.

This pull request is a defense-in-depth change and **does not fix shared
credentials**. A user with access to the actual HS256 signing key can mint
arbitrary JWT claims, including production issuer and audience; changing JWT
claims alone is not secret isolation.

## Code behavior
- Production retains issuer `gheverhan` and audience `gheverhan-web`.
  Existing production tokens retain their expected claims and remain valid.
- Vercel Preview uses issuer `gheverhan-preview` and audience
  `gheverhan-web-preview`.
- A token from one environment is not accepted in the other simply because the
  same key was accidentally configured.
- Existing Preview tokens will require a new login after this code is released.
- Local development retains production-format claims for backward compatibility;
  local deployments must still use development-only DB credentials and JWT keys.

## Release gates — required before production merge
1. Authorize/setup a **separate Preview database** according to
   `docs/security/VERCEL_PREVIEW_DATABASE_ISOLATION.md` in PR #40.
2. In Vercel Project Settings > Environment Variables, replace the shared
   `DATABASE_URL` and `DIRECT_URL` scopes with two isolated sets:
   production credentials scoped only to production, preview credentials scoped
   only to preview. Never copy production customer data into Preview.
3. **Replace the shared `JWT_SECRET` entry** with two cryptographically random,
   independently generated server-only values, each scoped to only one
   environment. Do not add `NEXT_PUBLIC_` prefixes. Configure values through
   Vercel's authenticated secret UI; never put them into Git, chat, logs or
   artifacts. Evaluate production-session invalidation before changing a live
   signing key; swapping a production signing key logs out all current users.
4. Deploy a safe Preview using synthetic accounts. Confirm:
   - Preview sign-in and protected route access work.
   - Preview token is rejected when verified as a production token (unit test).
   - Production sessions and existing accounts still behave correctly.
   - Preview cannot query or mutate production data; verify outside the app
     with read-only baseline counts.
5. Confirm `VERCEL_ENV` for each deployment and re-run CI and code review.
   Cross-check the latest production deployment, runtime errors and alias.
6. Any suspected signing-key disclosure requires an incident response and
   coordinated production-key rotation. The shared scope alone does not prove
   key disclosure; do not rotate live credentials blindly.

## Risk limitation
This code reduces accidental acceptance of sessions across deployments.
**It cannot protect production from a leaked/shared signing key** and is not
a substitute for unique key scopes, separate databases and deployment access
controls. Keep this PR isolated until the configuration gates above are met.
