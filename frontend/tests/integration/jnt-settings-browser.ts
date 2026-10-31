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

async function main() {
const target = new URL(process.env.SPRINT1_TEST_DATABASE_URL || "http://invalid");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
assert.equal(target.pathname, "/gheverhan_sprint1_test"); assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
const root = process.cwd(), base = "http://localhost:3102", artifact = path.resolve(process.env.SPRINT1_ARTIFACT_DIR || ".sprint1-artifacts", "jnt-settings");
const db = new PrismaClient({ datasources: { db: { url: target.toString() } } });
const prefix = randomUUID(); const results: string[] = [], errors: string[] = [];
const probe = createServer(); await new Promise<void>((resolve,reject) => { probe.once("error",reject); probe.listen(3102,"127.0.0.1",resolve); }); await new Promise<void>(r => probe.close(() => r()));
await mkdir(artifact,{recursive:true});
await db.jntPlatformIntegration.deleteMany({where:{environment:"sandbox"}});
const users = [];
for (const name of ["Super Admin", "Admin"]) {
  const role = await db.role.upsert({where:{name},create:{name,label:name},update:{}});
  users.push(await db.user.create({data:{name:"Jnt browser " + name,email:`jnt-browser-${name.replaceAll(" ","")}-${prefix}@example.test`,passwordHash:"synthetic-no-login",roles:{create:{roleId:role.id}}}}));
}
process.env.JWT_SECRET = "jnt-browser-synthetic-session-key-only";
const log = createWriteStream(path.join(artifact,"server.log"));
const child = spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p","3102"],{
  cwd:root,env:{...process.env,DATABASE_URL:target.toString(),DIRECT_URL:target.toString(),APP_ORIGIN:base,
    JNT_PLATFORM_OWNER_USER_IDS:users[0].id,JNT_INTEGRATION_ENCRYPTION_KEY:randomBytes(32).toString("base64"),
    JNT_API_ENV:"production",JNT_PRODUCTION_API_APPROVED:"no",JNT_ENABLE_ORDER_CREATE:"no",JNT_ENABLE_CANCELLATION:"no",
    REGION_DATA_MODE:"snapshot",MAINTENANCE_MODE:"0",REGISTRATION_OTP_CLEANUP_DISABLED:"1"},stdio:["ignore","pipe","pipe"],windowsHide:true,
});child.stdout.pipe(log);child.stderr.pipe(log);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await expect.poll(async()=>{try{return(await fetch(base+"/api/v1/health")).status;}catch{return 0;}},{timeout:30000}).toBe(200);
  browser = await chromium.launch({executablePath:process.env.SPRINT1_CHROMIUM_PATH || (existsSync("/usr/bin/chromium")?"/usr/bin/chromium":undefined)});
  const owner = await browser.newContext(); const seller = await browser.newContext(); const anonymous = await browser.newContext();
  for(const [context,user] of [[owner,users[0]],[seller,users[1]]] as const)await context.addCookies([{name:"gh_session",value:await signSession({sub:user.id,email:user.email}),domain:"localhost",path:"/",httpOnly:true,secure:true,sameSite:"Lax"}]);
  const page=await owner.newPage();page.on("pageerror",e=>errors.push(e.message));
  const endpoint=base+"/api/v1/admin/integrations/jnt";
  assert.equal((await anonymous.request.get(endpoint)).status(),401);
  assert.equal((await seller.request.get(endpoint)).status(),403);
  assert.equal((await seller.request.put(endpoint,{headers:{Origin:base},data:{}})).status(),403);
  const denied=await seller.newPage();assert.equal((await denied.goto(base+"/admin/integrations/jnt"))?.status(),404);
  results.push("owner-only GET/PUT and page enforce backend authorization; seller and anonymous denied");
  assert.equal((await owner.request.put(endpoint,{headers:{Origin:"https://attacker.example"},data:{}})).status(),403);
  results.push("cross-origin config mutation denied");
  const secrets = ["SYNTHETIC-BROWSER-OWNER","SYNTHETIC-BROWSER-API","SYNTHETIC-BROWSER-KEY","SYNTHETIC-BROWSER-CUSTOMER","SYNTHETIC-BROWSER-TARIFF","SYNTHETIC-BROWSER-TRACK","SYNTHETIC-BROWSER-PASSWORD"];
  for(const width of [320,360,375,390,430,768,1024,1440]) {
    await page.setViewportSize({width,height:900});assert.equal((await page.goto(base+"/admin/integrations/jnt",{waitUntil:"networkidle"}))?.status(),200);
    await expect(page.getByRole("heading",{name:"J&T Express API",exact:true})).toBeVisible();
    await expect(page.getByRole("button",{name:"Simpan konfigurasi",exact:true})).toBeEnabled();
    await expect(page.locator('input[type="url"]')).toHaveCount(4);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.getByRole("button",{name:"Production",exact:true}).click();
    await expect(page.locator('input[type="url"]').first()).toHaveValue(/^https:\/\/api\.jet\.co\.id\//);
    await page.getByRole("button",{name:"Testing",exact:true}).click();
    await expect(page.locator('input[type="url"]').first()).toHaveValue(/^https:\/\/demo-ecommerce\./);
    if(width===390){
      const credentialInputs=page.locator('form.space-y-5 input[type="text"],form.space-y-5 input[type="password"]');
      await expect(credentialInputs).toHaveCount(7);
      for(let i=0;i<secrets.length;i++)await credentialInputs.nth(i).fill(secrets[i]);
      await page.getByRole("button",{name:"Simpan konfigurasi",exact:true}).click();
      await expect(page.getByRole("status")).toContainText("berhasil disimpan terenkripsi");
      for(let i=0;i<secrets.length;i++)await expect(credentialInputs.nth(i)).toHaveValue("");
      const response=await owner.request.get(endpoint+"?environment=sandbox");assert.equal(response.status(),200);
      const text=await response.text();for(const secret of secrets)assert.ok(!text.includes(secret));
      assert.match(response.headers()["cache-control"],/no-store/);
      const stored=await db.jntPlatformIntegration.findUniqueOrThrow({where:{environment:"sandbox"}});
      for(const secret of secrets)assert.ok(!stored.encryptedConfig.includes(secret));
      assert.equal(await db.auditLog.count({where:{userId:users[0].id,action:"jnt.integration.updated"}}),1);
      results.push("browser saves actual encrypted DB settings with audit, clears inputs and redacts GET");
    }
    if([320,390,1440].includes(width))await page.screenshot({path:path.join(artifact,`settings-${width}.png`),fullPage:true});
    results.push(`owner form/environment separation/no overflow at ${width}px`);
  }
  assert.deepEqual(errors,[]);console.log(`PASS ${results.length} J&T configuration browser/API/DB checks`);
} finally {
  await writeFile(path.join(artifact,"results.json"),JSON.stringify({results,errors},null,2));
  await browser?.close();child.kill();await db.$disconnect();log.end();
}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
