import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, createWriteStream } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { chromium, expect } from "@playwright/test";
import { signSession } from "../../src/lib/auth/jwt";
import { createLocalStoreBrowserFixture } from "./jnt-self-hosted-https-fixture";

async function main() {
const watchdog = setTimeout(() => {
  // CI-only hard stop: a broken proxy/API request must fail with a useful
  // bounded log rather than consuming the entire 45-minute workflow.
  console.error("J&T browser fixture exceeded its 5-minute test budget");
  process.exit(1);
}, 300000);
watchdog.unref();
const target = new URL(process.env.SPRINT1_TEST_DATABASE_URL || "http://invalid");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
assert.equal(target.pathname, "/gheverhan_sprint1_test"); assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
const localStore = process.env.JNT_SELF_HOSTED_TESTS === "1";
const root = process.cwd(), artifact = path.resolve(process.env.SPRINT1_ARTIFACT_DIR || ".sprint1-artifacts", localStore ? "jnt-seller-settings" : "jnt-settings");
const prefix = randomUUID(); const results: string[] = [], errors: string[] = [];
const probe = createServer(); await new Promise<void>((resolve,reject) => { probe.once("error",reject); probe.listen(3102,"127.0.0.1",resolve); }); await new Promise<void>(r => probe.close(() => r()));
await mkdir(artifact,{recursive:true});
const admin = new PrismaClient({ datasources: { db: { url: target.toString() } } });
let fixture: Awaited<ReturnType<typeof createLocalStoreBrowserFixture>> | undefined;
try {
  if (localStore) {
    console.log("J&T fixture: provisioning isolated PostgreSQL + loopback TLS");
    fixture = await createLocalStoreBrowserFixture(root, admin, target);
    console.log("J&T fixture: separate database and TLS proxy ready");
  }
} finally { await admin.$disconnect(); }
const base = fixture?.origin || "http://localhost:3102";
const dbUrl = fixture?.database || target.toString();
const internalPort = fixture?.internalPort || 3102;
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
if (fixture) {
  // The test process must sign and validate the same scoped JWT issuer as
  // the real self-hosted Next.js server, not the legacy Gheverhan issuer.
  delete process.env.DIRECT_URL;
  Object.assign(process.env, fixture.env);
}
await db.jntPlatformIntegration.deleteMany({where:{environment:"sandbox"}});
const users = [];
for (const name of (localStore ? ["Super Admin", "Admin", "Manager"] : ["Super Admin", "Admin"])) {
  const role = await db.role.upsert({where:{name},create:{name,label:name},update:{}});
  if (localStore && name === "Admin") {
    // Fresh isolated PG has schema but deliberately no demo role seed.
    // Assign the SAME real shipping.update role relation that local admin
    // activation provides; a role name alone cannot grant API privileges.
    const permission = await db.permission.upsert({
      where: { key: "shipping.update" },
      create: { key: "shipping.update", label: "Ubah pengiriman" },
      update: {},
    });
    await db.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      create: { roleId: role.id, permissionId: permission.id },
      update: {},
    });
  }
  users.push(await db.user.create({data:{name:"Jnt browser " + name,email:`jnt-browser-${name.replaceAll(" ","")}-${prefix}@example.test`,passwordHash:"synthetic-no-login",roles:{create:{roleId:role.id}}}}));
}
process.env.JWT_SECRET = fixture?.env.JWT_SECRET || "jnt-browser-synthetic-session-key-only";
const log = createWriteStream(path.join(artifact,"server.log"));
const child = spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p",String(internalPort)],{
  cwd:root,env:{...process.env,DATABASE_URL:dbUrl,DIRECT_URL:fixture ? undefined : dbUrl,APP_ORIGIN:base,
    ...fixture?.env,
    JNT_CONFIG_SCOPE:localStore ? "local_store" : "legacy_platform",
    JETSELLER_STORE_PROFILE:localStore ? "self-hosted" : "",
    JETSELLER_INSTALLATION_ID:localStore ? "550e8400-e29b-41d4-a716-446655440000" : "",
    JNT_INSTALLATION_ID:localStore ? "550e8400-e29b-41d4-a716-446655440000" : "",
    JNT_PLATFORM_OWNER_USER_IDS:localStore ? "" : users[0].id,JNT_INTEGRATION_ENCRYPTION_KEY:randomBytes(32).toString("base64"),
    JNT_API_ENV:"production",JNT_PRODUCTION_API_APPROVED:"no",JNT_ENABLE_ORDER_CREATE:"no",JNT_ENABLE_CANCELLATION:"no",
    REGION_DATA_MODE:"snapshot",MAINTENANCE_MODE:"0",REGISTRATION_OTP_CLEANUP_DISABLED:"1"},stdio:["ignore","pipe","pipe"],windowsHide:true,
});child.stdout.pipe(log);child.stderr.pipe(log);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await expect.poll(async()=>{try{return(await fetch("http://127.0.0.1:"+internalPort+"/api/v1/health")).status;}catch{return 0;}},{timeout:30000}).toBe(200);
  if (localStore) console.log("J&T fixture: Next server health 200; opening HTTPS browser");
  browser = await chromium.launch({executablePath:process.env.SPRINT1_CHROMIUM_PATH || (existsSync("/usr/bin/chromium")?"/usr/bin/chromium":undefined),
    ...(fixture ? { proxy: { server: fixture.proxy } } : {}) });
  const options = fixture ? {ignoreHTTPSErrors:true} : {};
  const owner = await browser.newContext(options); const seller = await browser.newContext(options); const anonymous = await browser.newContext(options);
  for(const [context,user] of [[owner,users[localStore ? 1 : 0]],[seller,users[localStore ? 2 : 1]]] as const)await context.addCookies([{name:fixture?.cookieName || "gh_session",value:await signSession({sub:user.id,email:user.email}),domain:fixture?.domain || "localhost",path:"/",httpOnly:true,secure:true,sameSite:"Lax"}]);
  const page=await owner.newPage();page.on("pageerror",e=>errors.push(e.message));
  if (localStore) console.log("J&T fixture: browser contexts and scoped session cookies ready");
  const endpoint=base+"/api/v1/admin/integrations/jnt";
  if (localStore) console.log("J&T fixture: checking anonymous/seller authorization through HTTPS");
  assert.equal((await anonymous.request.get(endpoint,{timeout:10000})).status(),401);
  assert.equal((await seller.request.get(endpoint,{timeout:10000})).status(),403);
  assert.equal((await seller.request.put(endpoint,{headers:{Origin:base},data:{},timeout:10000})).status(),403);
  const denied=await seller.newPage();assert.equal((await denied.goto(base+"/admin/integrations/jnt"))?.status(),404);
  results.push("owner-only GET/PUT and page enforce backend authorization; seller and anonymous denied");
  assert.equal((await owner.request.put(endpoint,{headers:{Origin:"https://attacker.example"},data:{}})).status(),403);
  results.push("cross-origin config mutation denied");
  const secrets = ["SYNTHETIC-BROWSER-OWNER","SYNTHETIC-BROWSER-API","SYNTHETIC-BROWSER-KEY","SYNTHETIC-BROWSER-CUSTOMER","SYNTHETIC-BROWSER-TARIFF","SYNTHETIC-BROWSER-TRACK","SYNTHETIC-BROWSER-PASSWORD"];
  for(const width of [320,360,375,390,430,768,1024,1440]) {
    await page.setViewportSize({width,height:900});assert.equal((await page.goto(base+"/admin/integrations/jnt",{waitUntil:"networkidle"}))?.status(),200);
    await expect(page.getByRole("heading",{name:"J&T Express",exact:true})).toBeVisible();
    await expect(page.getByRole("button",{name: localStore ? "Simpan Pengaturan" : "Simpan konfigurasi",exact:true})).toBeEnabled();
    await expect(page.locator('input[type="url"]')).toHaveCount(4);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.getByRole("button",{name:"Production",exact:true}).click();
    await expect(page.locator('input[type="url"]').first()).toHaveValue(/^https:\/\/api\.jet\.co\.id\//);
    await page.getByRole("button",{name:"Sandbox",exact:true}).click();
    await expect(page.locator('input[type="url"]').first()).toHaveValue(/^https:\/\/demo-ecommerce\./);
    if(width===390){
      const credentialInputs=page.locator('input[data-jnt-secret]');
      await expect(credentialInputs).toHaveCount(7);
      for(let i=0;i<secrets.length;i++)await credentialInputs.nth(i).fill(secrets[i]);
      if(localStore) {
        for(const [label,value] of [["Nama pengirim","Synthetic sender"],["Kontak gudang","Synthetic contact"],["Telepon (+62)","+6281234567890"],["Alamat gudang","Synthetic warehouse address"],["Nama kota asal resmi (Tariff)","JAKARTA"],["Kode kota asal resmi (Order)","JKT"]]) await page.getByLabel(label,{exact:true}).fill(value);
      }
      await page.getByRole("button",{name: localStore ? "Simpan Pengaturan" : "Simpan konfigurasi",exact:true}).click();
      await expect(page.getByRole("status")).toContainText("Pengaturan tersimpan");
      for(let i=0;i<secrets.length;i++)await expect(credentialInputs.nth(i)).toHaveValue("");
      const response=await owner.request.get(endpoint+"?environment=sandbox");assert.equal(response.status(),200);
      const text=await response.text();for(const secret of secrets)assert.ok(!text.includes(secret));
      if(localStore) {
        assert.equal(JSON.parse(text).data.shippingReady,false);
        await page.getByText("Verifikasi Order",{exact:true}).click();
        await page.getByRole("button",{name:"Periksa verifikasi Order",exact:true}).click();
        await expect(page.getByRole("status")).toContainText("Tidak ada permintaan J&T dikirim");
        const foreign=await owner.request.post(endpoint+"/test",{headers:{Origin:base},data:{environment:"sandbox",endpoint:"order",installationId:"foreign-store"}});
        assert.equal(foreign.status(),422);
        const stored=await db.jntPlatformIntegration.findUniqueOrThrow({where:{environment:"sandbox"}});
        assert.ok(stored.encryptedConfig.startsWith("v2:"));
        for(const secret of secrets)assert.ok(!stored.encryptedConfig.includes(secret));
      }
      assert.match(response.headers()["cache-control"],/no-store/);
      const stored=await db.jntPlatformIntegration.findUniqueOrThrow({where:{environment:"sandbox"}});
      for(const secret of secrets)assert.ok(!stored.encryptedConfig.includes(secret));
      assert.equal(await db.auditLog.count({where:{userId:users[localStore ? 1 : 0].id,action:"jnt.integration.updated"}}),1);
      results.push("browser saves actual encrypted DB settings with audit, clears inputs and redacts GET");
    }
    if([320,390,1440].includes(width))await page.screenshot({path:path.join(artifact,`settings-${width}.png`),fullPage:true});
    results.push(`owner form/environment separation/no overflow at ${width}px`);
  }
  assert.deepEqual(errors,[]);console.log(`PASS ${results.length} J&T configuration browser/API/DB checks`);
} finally {
  await writeFile(path.join(artifact,"results.json"),JSON.stringify({results,errors},null,2));
  clearTimeout(watchdog);
  await browser?.close();child.kill();await db.$disconnect();log.end();await fixture?.close();
}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
