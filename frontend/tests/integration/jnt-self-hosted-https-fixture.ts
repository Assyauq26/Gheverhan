import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { connect as netConnect } from "node:net";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

type Server = ReturnType<typeof createHttpServer>;
type SSLServer = ReturnType<typeof createHttpsServer>;
const domain = "store.example";
const id = "550e8400-e29b-41d4-a716-446655440000";
const dbname = "js_" + id.replaceAll("-", "");

function listen(server: Server | SSLServer, port: number) {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}
async function closeServer(server: Server | SSLServer) {
  return new Promise<void>(resolve => server.close(() => resolve()));
}

/**
 * Disposable HTTPS browser fixture, NOT public TLS or an approved store deployment.
 * CONNECT is allowed only to one synthetic origin, forwarded exclusively to a
 * loopback TLS proxy; it never forwards arbitrary external HTTP destinations.
 */
export async function createLocalStoreBrowserFixture(root: string, admin: PrismaClient, dbUrl: URL) {
  assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
  assert.equal(dbUrl.hostname, "127.0.0.1");
  assert.equal(dbUrl.pathname, "/gheverhan_sprint1_test");

  // An isolated DB with a canonical store name is required by the actual
  // parseSelfHostedConfig path used for auth issuer and CSRF-origin checks.
  // On this disposable CI PostgreSQL, the test superuser owns the fixture DB.
  await admin.$executeRawUnsafe('CREATE DATABASE "' + dbname + '"');
  const direct = new URL(dbUrl.toString());
  direct.pathname = "/" + dbname;
  const migrate = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: direct.toString(), DIRECT_URL: direct.toString() },
    encoding: "utf8", timeout: 120000,
  });
  if (migrate.status !== 0) throw new Error("Disposable self-hosted PostgreSQL migration failed");

  // A CI-only loopback network alias for 'db' is supplied by the workflow;
  // this is a real standalone database, not a test-only bypass in app code.
  const runtimeDB = new URL(direct.toString());
  runtimeDB.hostname = "db";
  const origin = "https://" + domain;
  const env: Record<string, string> = {
    JETSELLER_STORE_PROFILE: "self-hosted",
    JETSELLER_INSTALLATION_ID: id,
    JETSELLER_INSTALLATION_MODE: "new",
    JETSELLER_STORE_DOMAIN: domain,
    APP_ORIGIN: origin,
    STORAGE_PROVIDER: "local",
    STORAGE_APP_NAME: "js_" + id.slice(0, 8),
    STORAGE_LOCAL_ROOT: "/tmp/jetseller-jnt-https-fixture",
    DATABASE_URL: runtimeDB.toString(),
    JETSELLER_MIGRATION_IDENTITY: "js_migrate",
    JWT_SECRET: "a".repeat(64),
    AUTH_COOKIE_NAME: "js_" + id.slice(0, 8) + "_session",
    PASSWORD_RESET_FROM: "JetSeller <noreply@" + domain + ">",
    PASSWORD_RESET_BASE_URL: origin,
    JNT_CONFIG_SCOPE: "local_store",
    JNT_INSTALLATION_ID: id,
  };

  const certRoot = mkdtempSync(path.join(os.tmpdir(), "js-jnt-ci-tls-"));
  const keyFile = path.join(certRoot, "key.pem");
  const certFile = path.join(certRoot, "cert.pem");
  const result = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-days", "1", "-subj", "/CN=" + domain, "-addext", "subjectAltName=DNS:" + domain,
    "-keyout", keyFile, "-out", certFile], { stdio: "ignore", timeout: 15000 });
  if (result.status !== 0) throw new Error("Disposable local TLS certificate setup failed");

  // Next serves internally on HTTP loopback. All browser/API traffic enters
  // through the HTTPS layer; the Origin is the actual synthetic HTTPS store.
  const https = createHttpsServer({
    key: readFileSync(keyFile), cert: readFileSync(certFile),
  }, (request, response) => {
    const upstream = httpRequest({
      hostname: "127.0.0.1", port: 3103, path: request.url, method: request.method,
      headers: { ...request.headers, host: domain, "x-forwarded-proto": "https" },
    }, result => { response.writeHead(result.statusCode || 502, result.headers); result.pipe(response); });
    upstream.on("error", () => { if (!response.headersSent) response.writeHead(502); response.end(); });
    request.pipe(upstream);
  });
  // An HTTP CONNECT proxy makes an ordinary port-443 HTTPS origin usable
  // without requiring root privileges or host DNS changes for Chromium.
  const proxy = createHttpServer((_request, response) => {
    response.writeHead(403); response.end();
  });
  proxy.on("connect", (request, client, head) => {
    if (request.url !== domain + ":443") { client.destroy(); return; }
    const upstream = netConnect(3102, "127.0.0.1", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      upstream.pipe(client); client.pipe(upstream);
    });
    upstream.on("error", () => client.destroy());
    client.on("error", () => upstream.destroy());
  });
  await listen(https, 3102);
  try { await listen(proxy, 3104); }
  catch (error) { await closeServer(https); rmSync(certRoot, { recursive: true, force: true }); throw error; }

  return {
    origin, env, database: direct.toString(), internalPort: 3103,
    proxy: "http://127.0.0.1:3104",
    cookieName: env.AUTH_COOKIE_NAME, domain,
    close: async () => {
      await closeServer(proxy);
      await closeServer(https);
      rmSync(certRoot, { recursive: true, force: true });
    },
  };
}
