# Gheverhan Netlify deployment

The Next.js project lives in `frontend/`. Netlify's root `netlify.toml` selects `frontend` as the build base.

## Build

```sh
cd frontend
npm install
npm run build
```

`npm run build` runs `prisma generate && next build`. The Prisma CLI and `@prisma/client` must be pinned to matching versions. The build must not create or reactivate user accounts, assign roles, or write other production database records.

## Required environment

Configure database and authentication credentials in Netlify site environment variables (not committed source files). `DATABASE_URL`, `DIRECT_URL` and `JWT_SECRET` are used by the app or Prisma. Configure distinct and restricted non-production database credentials for Deploy Previews before testing any routes that access data. Never expose these values in logs or PR comments.

## Admin account provisioning (intentional one-off operation)

`npm run prisma:bootstrap-admin` remains available **as an explicit administrative maintenance command**, not as part of the Netlify build. It requires `ADMIN_EMAIL` and either a validated `ADMIN_PASSWORD_HASH` or `ADMIN_PASSWORD` with at least 12 characters, as well as access to the intended database. Run it only in an approved, protected environment after checking the exact target database and taking appropriate backups. Existing admin accounts are not automatically assigned a new password; use a dedicated and authenticated reset process for that purpose.

**Important:** This bootstrap currently grants the Admin role and reactivates inactive matching users. Review that behavior before invoking it. Do not run `npm run seed` against production: the seed script deletes data.

## Verification before merge

1. Wait for the Netlify Deploy Preview and check that dependency installation and production build pass.
2. Check TypeScript and unit tests where a runner with the required environment is available.
3. Verify `/forgot-password`, login, and relevant storefront routes against an isolated environment.
4. Merge only after review. Do not publish test credentials or reset tokens.
