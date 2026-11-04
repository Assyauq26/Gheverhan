const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pages = [
  ["index.html", "/"],
  ["daftar/index.html", "/daftar/"],
  ["masuk/index.html", "/masuk/"],
];

test("JetSeller public pages use the new canonical origin and never claim legacy canonical URLs", () => {
  for (const [name, route] of pages) {
    const html = fs.readFileSync(path.join(root, name), "utf8");
    assert.ok(html.includes(`<link rel="canonical" href="https://buattokosendiri.web.id${route}"`), name);
    assert.ok(html.includes(`<meta property="og:url" content="https://buattokosendiri.web.id${route}"`), name);
    assert.ok(!html.includes("https://jetseller.web.id"), name);
  }
  const notFound = fs.readFileSync(path.join(root, "404.html"), "utf8");
  assert.match(notFound, /buattokosendiri.web.id/);
  assert.doesNotMatch(notFound, /jetseller.web.id/);
});

test("draft Caddy migrates landing while preserving Gheverhan and keeping portal isolated", () => {
  const caddy = fs.readFileSync(path.join(root, "deploy/Caddyfile.jetseller.DRAFT"), "utf8");
  assert.match(caddy, /gheverhan\.store\s*\{[\s\S]*?reverse_proxy app:3000/);
  assert.match(caddy, /buattokosendiri\.web\.id\s*\{[\s\S]*?root \* \/data\/landing\/buattokosendiri\/current/);
  assert.match(caddy, /www\.buattokosendiri\.web\.id\s*\{\s*redir https:\/\/buattokosendiri\.web\.id\{uri\} permanent/);
  assert.match(caddy, /\njetseller\.web\.id\s*\{\s*root \* \/data\/landing\/jetseller\s*file_server/);
  assert.doesNotMatch(caddy, /jetseller\.web\.id\s*\{\s*redir https:\/\/buattokosendiri/);
  assert.ok(!/^[^\n]*\*\.buattokosendiri\.web\.id\s*\{/m.test(caddy), "no wildcard tenant routing");
  assert.ok(!/dashboard\.buattokosendiri\.web\.id\s*\{/m.test(caddy), "no unreviewed seller portal reverse proxy");
});

test("verified Go installer defaults to new dedicated portal origin, not the static landing", () => {
  const go = fs.readFileSync(path.join(root, "../../agent/cmd/jetseller-setup/main.go"), "utf8");
  assert.ok(go.includes('flags.String("control-origin", "https://dashboard.buattokosendiri.web.id"'));
  assert.ok(!go.includes('flags.String("control-origin", "https://jetseller.web.id"'));
});
