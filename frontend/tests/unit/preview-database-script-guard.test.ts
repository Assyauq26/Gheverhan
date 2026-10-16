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
