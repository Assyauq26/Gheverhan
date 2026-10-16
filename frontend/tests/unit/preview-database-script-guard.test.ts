import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const guard = fileURLToPath(new URL("../../scripts/assert-safe-db-operation.mjs", import.meta.url));
const scripts = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).scripts as Record<string, string>;
function checkGuard(vercelEnv: string | undefined) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (vercelEnv === undefined) delete env.VERCEL_ENV;
  else env.VERCEL_ENV = vercelEnv;
  // No network/database connection: the test executes ONLY the guard.
  return spawnSync(process.execPath, [guard], { env, encoding: "utf8" });
}

describe("shared development DB: Preview must not execute mutating npm scripts", () => {
  it("rejects any Preview migration/seed/bootstrap even when shared DB is approved", () => {
    const result = checkGuard("preview");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("disabled from Vercel Preview");
    expect(result.stderr).not.toContain("postgresql://");
  });

  it("preserves approved manual workflows outside Preview", () => {
    for (const target of ["production", "development", undefined]) {
      const result = checkGuard(target);
      expect(result.status).toBe(0);
    }
  });

  it("guards all four project-maintained database mutation entrypoints", () => {
    for (const name of ["prisma:migrate", "prisma:deploy", "prisma:bootstrap-admin", "seed"]) {
      expect(scripts[name]).toMatch(/^node scripts\/assert-safe-db-operation\.mjs && /);
    }
    expect(scripts.build).not.toContain("assert-safe-db-operation");
  });
});

// Exercise real entrypoints, never inherited credentials or shared databases.
// Closed loopback port and explicit sentinel avoid any shared database access.
describe("direct database entrypoints", () => {
  for (const entry of ["prisma/seed.ts", "prisma/bootstrap-admin.ts"]) {
    it(`rejects direct ${entry} with safe nonzero error`, () => {
      const result = spawnSync(process.execPath, ["--import", "tsx", entry], {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        env: {
          PATH: process.env.PATH,
          NODE_ENV: "test",
          VERCEL_ENV: "preview",
          GHEVERHAN_SHARED_DEV_DATABASE: "true",
          DATABASE_URL: "postgresql://test:credential-sentinel@127.0.0.1:1/isolated",
          DIRECT_URL: "postgresql://test:credential-sentinel@127.0.0.1:1/isolated",
          ADMIN_EMAIL: "fixture@example.test",
          ADMIN_PASSWORD: "only-isolated-fixture",
        },
        encoding: "utf8",
        timeout: 10000,
      });
      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(result.signal).toBeNull();
      expect(result.stderr).toContain("disabled from Vercel Preview");
      expect(result.stdout).not.toContain("Seeding");
      expect(result.stderr).not.toContain("credential-sentinel");
      expect(result.stderr).not.toContain("PrismaClientInitializationError");
    });
  }
});


describe("entrypoint database errors", () => {
  for (const entry of ["prisma/seed.ts", "prisma/bootstrap-admin.ts"]) {
    it(`redacts database errors from ${entry}`, () => {
      const result = spawnSync(process.execPath, ["--import", "tsx", entry], {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        env: {
          PATH: process.env.PATH, NODE_ENV: "test", VERCEL_ENV: "development",
          DATABASE_URL: "postgresql://test:credential-sentinel@127.0.0.1:1/isolated",
          DIRECT_URL: "postgresql://test:credential-sentinel@127.0.0.1:1/isolated",
          ADMIN_EMAIL: "fixture@example.test", ADMIN_PASSWORD: "only-isolated-fixture",
        },
        encoding: "utf8", timeout: 10000,
      });
      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(result.signal).toBeNull();
      expect(result.stderr).toContain("[database-safety]");
      expect(result.stderr).not.toContain("credential-sentinel");
      expect(result.stderr).not.toContain("postgresql://");
      expect(result.stderr).not.toContain("PrismaClient");
    });
  }
});
