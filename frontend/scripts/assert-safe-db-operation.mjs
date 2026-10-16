/**
 * Guard project-maintained database mutation entrypoints.
 *
 * Gheverhan is temporarily sharing its DUMMY-DATA Supabase development DB
 * between main and Vercel Preview. A Preview build must never apply schema
 * migrations, seed data or bootstrap an admin through npm scripts.
 *
 * This does not sandbox arbitrary direct Prisma CLI commands or application
 * code. Protect deployment permissions and PR trust boundaries separately.
 */
const isPreview = process.env.VERCEL_ENV === "preview";
if (isPreview) {
  console.error(
    "[database-safety] Database migrations, seeds and admin bootstrap are disabled from Vercel Preview. " +
    "Use a reviewed, explicitly approved manual process outside Preview.",
  );
  process.exitCode = 1;
}
