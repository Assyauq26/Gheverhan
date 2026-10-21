import fs from "node:fs";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const ROOT = "candidate/frontend";
const PROJECT_REF = "bztprltkevacidcpjaam";
const VERCEL_TEAM = "team_TzXXNjuky0A7TUqf1vxHDE77";
const VERCEL_PROJECT = "prj_J8Fao07yrACLGjiDtY3ftRcLkI2s";
const FINAL_SHA = "ff6e4defcf0b8822ef46ade65081d3cdca593fea";
const prHeads = new Map([
  [75, "d685813d02e457e5ccc182a145598c3b139b5559"],
  [83, "62477c97ded2ac2ab552b31c7e9ac1a3fd045032"],
  [84, FINAL_SHA],
]);
const historical = new Map([
  ["20260922143925_init", "f6c17309e9a970b2479bece2546cece8a7a483d0c7fa748e662d479b0e1910b9"],
  ["20261015000000_add_refunded_payment_status", "e86e9a4d4ec18d6c60ebabceeaa9506a718de29059b1234a38dd2764c24a2e81"],
  ["20261016112100_coupon_usage_limits", "1f7ef91ea2b13c0bd6928602968c03c37b5bcc00cb7d351d679a0ff903c74265"],
  ["20261016112200_coupon_redemption_concurrent_index", "f205120c21d348d14f016ebdf793b9e6a93686ad5cba80227f3d66d3f632d40d"],
  ["20261016140500_product_scheduled_flash_sale", "e0598e543c8fed33e5ee69f085f8d6a22230ebe288b72d6ab9d53293cb9abb39"],
  ["20261017000000_auth_session_controls", "35d593d27d0e0cd708d6c9353b61343e46481b9e7795656165297efbc16d88d1"],
  ["20261018150000_registration_email_otp", "eec85ff983628830923da3c7b0760bfc20378bdcf9cb7376dd6b1cca539eb84e"],
  ["20261019054922_registration_identity_lookup_indexes", "369372134dd10fca58dc04e5afb4b4bcec347c948524f239918f1663e8fa3d0b"],
]);
const newMigrations = new Map([
  ["20261020070000_custom_product_variations", "499d4c6259b90c2342c5dc1a2baebcb04e72751c8a9f3111414ad7db492e4735"],
  ["20261020120000_direct_checkout_intents", "96c9e45d13d8379c67bfdd87f3971664e3dcd43d19b6e430f60f7899186f55f0"],
]);
const expected = new Map([...historical, ...newMigrations]);
function fail(message) { throw new Error("BLOCKED: " + message); }
function need(name) {
  const value = process.env[name];
  if (!value) fail("Required protected secret or input missing: " + name);
  return value;
}
function source(verifyDispatch = true) {
  if (verifyDispatch && process.env.GITHUB_REF !== "refs/heads/main") fail("Dispatch must run from main");
  if (process.env.INPUT_PROJECT_REF !== PROJECT_REF) fail("Production project ref mismatch");
  if (process.env.INPUT_APPROVED_SHA !== FINAL_SHA) fail("Unreviewed candidate SHA");
  const folders = fs.readdirSync(ROOT + "/prisma/migrations")
    .filter(x => /^[0-9]{14}_[a-z0-9_]+$/i.test(x)).sort();
  if (folders.length !== expected.size ||
      folders.some((name, i) => name !== [...expected.keys()][i])) fail("Unexpected migration directory set");
  for (const [name, sha] of expected) {
    const actual = crypto.createHash("sha256")
      .update(fs.readFileSync(ROOT + "/prisma/migrations/" + name + "/migration.sql")).digest("hex");
    if (actual !== sha) fail("Migration hash mismatch: " + name);
  }
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: "candidate", encoding: "utf8", timeout: 10000,
  });
  if (result.status !== 0 || result.stdout.trim() !== FINAL_SHA) fail("Candidate Git SHA mismatch");
  console.log("PASS: immutable source SHA and 10 migration SHA-256 checksums");
}
async function request(base, path, token) {
  const response = await fetch(base + path, {
    headers: { Authorization: "Bearer " + token, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) fail("Provider inspection failed with HTTP " + response.status);
  return response.json();
}
async function githubReview() {
  const token = need("GITHUB_TOKEN");
  const base = "https://api.github.com/repos/Assyauq26/Gheverhan";
  for (const [number, sha] of prHeads) {
    const pr = await request(base, "/pulls/" + number, token);
    if (pr.state !== "open" || pr.head?.sha !== sha || pr.merged_at) fail("PR #" + number + " is not at the reviewed HEAD");
    const reviews = await request(base, "/pulls/" + number + "/reviews?per_page=100", token);
    const reviewer = reviews.filter(x => x.user?.login?.toLowerCase() === "mrifatsyauqi")
      .sort((a,b) => new Date(b.submitted_at) - new Date(a.submitted_at))[0];
    if (reviewer?.state !== "APPROVED" || reviewer.commit_id !== sha) {
      fail("Human approval for exact current HEAD missing on PR #" + number);
    }
    const runs = await request(base,
      "/actions/runs?event=pull_request&head_sha=" + sha + "&per_page=100", token);
    for (const workflowName of ["Unit tests with Critical containment",
                                 "Sprint 2E isolated PostgreSQL and browser regression"]) {
      const run = runs.workflow_runs?.filter(x => x.name === workflowName)
        .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0];
      if (!run || run.status !== "completed" || run.conclusion !== "success") {
        fail("Required CI not SUCCESS for PR #" + number + ": " + workflowName);
      }
    }
  }
  console.log("PASS: exact PR heads, human approvals and both required CI workflows");
}
async function vercel(operation) {
  const token = need("VERCEL_TOKEN");
  const base = "https://api.vercel.com";
  const project = await request(base,
    "/v9/projects/" + VERCEL_PROJECT + "?teamId=" + VERCEL_TEAM, token);
  if (project.id !== VERCEL_PROJECT || project.accountId !== VERCEL_TEAM) fail("Vercel project/scope mismatch");
  const domain = await request(base, "/v9/projects/" + VERCEL_PROJECT +
    "/domains/gheverhan.store?teamId=" + VERCEL_TEAM, token);
  if (!domain.verified || domain.projectId !== VERCEL_PROJECT) fail("Vercel domain verification mismatch");
  const deployments = await request(base,
    "/v6/deployments?projectId=" + VERCEL_PROJECT + "&teamId=" + VERCEL_TEAM + "&limit=30", token);
  const items = deployments.deployments ?? [];
  if (items.some(x => ["BUILDING", "INITIALIZING", "QUEUED"].includes(x.state || x.readyState))) {
    fail("Active Vercel deployment in progress; writer isolation not proven");
  }
  const ready = items.filter(x => x.target === "production" &&
    (x.state === "READY" || x.readyState === "READY"))
    .sort((a,b) => (b.created || 0) - (a.created || 0))[0];
  if (!ready) fail("Vercel READY Production deployment not found");
  // The newest READY deployment is not necessarily the deployment assigned
  // to a public alias (rollback and failed promotion are common).
  const active = await request(base,
    "/v13/deployments/gheverhan.store?url=gheverhan.store&teamId=" + VERCEL_TEAM, token);
  if (active.project?.id !== VERCEL_PROJECT ||
      active.target !== "production" ||
      !["READY"].includes(active.readyState || active.state) ||
      !active.alias?.includes("gheverhan.store")) {
    fail("Current gheverhan.store alias does not serve an authorized READY Production deployment");
  }
  if (operation === "verify_live" && active.meta?.githubCommitSha !== process.env.INPUT_MAIN_SHA) {
    fail("Current gheverhan.store alias Git SHA differs from final main SHA");
  }
  console.log("PASS: scoped Vercel project, verified domain and currently serving READY Production alias");
}
function getPgEnv() {
  const urls = ["DATABASE_URL", "DIRECT_URL"].map(key => {
    const u = new URL(need(key));
    const host = u.hostname.toLowerCase(), user = decodeURIComponent(u.username);
    const goodHost = host === "db." + PROJECT_REF + ".supabase.co" ||
      (host.endsWith(".pooler.supabase.com") && user.endsWith("." + PROJECT_REF));
    if (!["postgres:", "postgresql:"].includes(u.protocol) || !goodHost ||
        u.pathname !== "/postgres" || !u.password ||
        (u.searchParams.get("schema") || "public") !== "public") {
      fail("Protected " + key + " targets unexpected database");
    }
    return u;
  });
  if (!process.env.PGSSLROOTCERT) fail("Verified TLS CA path not configured");
  const u = urls[1];
  return { ...process.env, PGHOST: u.hostname, PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: "postgres", PGSSLMODE: "verify-full", PGCONNECT_TIMEOUT: "10" };
}
function ledger(phase) {
  const names = phase === "before" ? historical : expected;
  const tuples = [...names].map(([n,s]) => "('" + n + "','" + s + "')").join(",");
  const requireMissing = phase === "before"
    ? "AND to_regclass('public.\"ProductOptionGroup\"') IS NULL AND to_regclass('public.\"CheckoutIntent\"') IS NULL"
    : "AND to_regclass('public.\"ProductOptionGroup\"') IS NOT NULL AND to_regclass('public.\"ProductOptionValue\"') IS NOT NULL AND to_regclass('public.\"ProductVariantOptionValue\"') IS NOT NULL AND to_regclass('public.\"CheckoutIntent\"') IS NOT NULL";
  const sql = "BEGIN READ ONLY; SET LOCAL statement_timeout = '10s'; " +
    "WITH expected(name,sha) AS (VALUES " + tuples + ") " +
    "SELECT CASE WHEN current_database()='postgres' " +
    "AND (SELECT count(*) FROM public._prisma_migrations)=" + names.size + " " +
    "AND (SELECT count(*) FROM public._prisma_migrations m JOIN expected e " +
    "ON m.migration_name=e.name AND m.checksum=e.sha " +
    "WHERE m.finished_at IS NOT NULL AND m.rolled_back_at IS NULL)=" + names.size + " " +
    "AND (SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() " +
    "AND datname=current_database() AND xact_start IS NOT NULL " +
    "AND now()-xact_start > interval '60 seconds')=0 " +
    requireMissing + " THEN 'PASS' ELSE 'BLOCKED' END; COMMIT;";
  const result = spawnSync("psql", ["-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"], {
    input: sql, encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024, env: getPgEnv(),
  });
  if (result.status !== 0 || !result.stdout?.split("\n").some(x => x.trim() === "PASS")) {
    fail("Prisma Production ledger / TLS / schema check failed (" + phase + ")");
  }
  console.log("PASS: " + names.size + "/" + names.size + " exact migration hashes and " + phase + "-migration schema");
}
async function maintenance() {
  if (process.env.INPUT_MAINTENANCE !== "YES" ||
      process.env.INPUT_WRITER_ISOLATION !== "YES" ||
      process.env.INPUT_BACKUP_DECISION !== "NO_ADDITIONAL_BACKUP_DUMMY_DATA") {
    fail("Missing explicit maintenance, all-writers isolation, or dummy-data backup decision");
  }
  for (const host of ["gheverhan.store", "www.gheverhan.store"]) {
    for (const [method, pathname] of [["GET", "/"], ["POST", "/api/__cutover_write_probe"]]) {
      const response = await fetch("https://" + host + pathname, {
        method, cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(20000),
      });
      const body = await response.text();
      if (response.status !== 503 ||
          !body.includes("Layanan sedang dalam pemeliharaan") ||
          !/no-store/i.test(response.headers.get("cache-control") || "")) {
        fail("Production maintenance not effective for " + host + " " + method);
      }
    }
  }
  console.log("PASS: confirmed maintenance responses; operator attested isolation of old/Preview writers");
}
async function live() {
  const sha = need("INPUT_MAIN_SHA");
  if (!/^[a-f0-9]{40}$/.test(sha)) fail("Expected merged main SHA is invalid");
  const main = await request("https://api.github.com/repos/Assyauq26/Gheverhan",
    "/commits/main", need("GITHUB_TOKEN"));
  if (main.sha !== sha) fail("Provided main SHA does not match actual GitHub main HEAD");
  for (const domain of ["gheverhan.store", "www.gheverhan.store"]) {
    for (const route of ["/", "/shop", "/login", "/register", "/api/v1/health"]) {
      const response = await fetch("https://" + domain + route, {
        redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(25000),
      });
      if (response.status !== 200) fail("LIVE route unhealthy: " + domain + route);
      if (route === "/api/v1/health" && !(await response.text()).includes('"status":"ok"')) {
        fail("LIVE health response invalid: " + domain);
      }
    }
  }
  console.log("PASS: public read-only Production smoke and matched Vercel release SHA");
}

try {
  const mode = process.argv[2];
  if (mode === "source") source();
  else if (mode === "source-static") source(false);
  else if (mode === "review") await githubReview();
  else if (mode === "vercel") await vercel(process.env.INPUT_OPERATION);
  else if (mode === "ledger-before") ledger("before");
  else if (mode === "ledger-after") ledger("after");
  else if (mode === "maintenance") await maintenance();
  else if (mode === "verify-live") await live();
  else fail("Unsupported action");
} catch (error) {
  console.error(error instanceof Error ? error.message : "BLOCKED: unexpected gate error");
  process.exitCode = 1;
}
