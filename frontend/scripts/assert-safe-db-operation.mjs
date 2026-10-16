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
export function assertSafeDatabaseOperation(env = process.env) {
  if (env.VERCEL_ENV === "preview") {
    throw new Error(
      "[database-safety] Database migrations, seeds and admin bootstrap are disabled from Vercel Preview. " +
      "Use a reviewed, explicitly approved manual process outside Preview.",
    );
  }
}

// Importing has no side effects. Each entrypoint calls the assertion before
// constructing a client; this executable is also the migration preflight.
import path from "node:path";
import { fileURLToPath } from "node:url";
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assertSafeDatabaseOperation();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
