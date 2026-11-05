import {createServer,request as httpRequest} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
import {createRegistrationServer} from '../src/server.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const databaseUrl=process.env.BTOS_REGISTRATION_TEST_DATABASE_URL;
if(process.env.BTOS_REGISTRATION_TEST_CONFIRM!=='isolated-registration-fixture'||!databaseUrl||!new URL(databaseUrl).pathname.endsWith('_fixture'))throw new Error('Fixture database required');
const owner=new pg.Pool({connectionString:databaseUrl});
const db=new URL(databaseUrl);db.username='btos_registration_runtime';db.password='synthetic-registration-only';
const pool=new pg.Pool({connectionString:db.toString()});
const origin='http://127.0.0.1:18765',proxyToken=randomBytes(32).toString('hex');
const api=createRegistrationServer({pool,origin,secret:randomBytes(32).toString('hex'),proxyToken});
await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));
const apiOrigin='http://127.0.0.1:'+api.address().port;
const base=resolve('landing/jetseller');const evidence=resolve('.release-evidence/registration-ui');await mkdir(evidence,{recursive:true});
let clientIP='192.0.2.240';
const front=createServer(async(req,res)=>{try{
  const path=new URL(req.url,origin).pathname;
  if(path.startsWith('/api/')){const headers={...req.headers,host:new URL(origin).host,'x-btos-registration-proxy':proxyToken,'x-btos-client-ip':clientIP};const upstream=httpRequest(apiOrigin+req.url,{method:req.method,headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});upstream.on('error',()=>res.writeHead(503).end());req.pipe(upstream);return;}
  if(['/daftar','/daftar/','/masuk','/masuk/'].includes(path)){res.writeHead(308,{Location:'/pendaftaran'}).end();return;}
  const file=['/','/pendaftaran','/pendaftaran/','/panduan','/panduan/','/kebijakan-privasi','/kebijakan-privasi/'].includes(path)?resolve(base,'.'+path,'index.html'):resolve(base,'.'+path);
  if(!file.startsWith(base+'/')&&!file.startsWith(base+'\\')){res.writeHead(404).end();return;}
  const bytes=await readFile(file);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png'})[extname(file)]||'text/plain'}).end(bytes);
}catch{res.writeHead(404).end();}});
await new Promise(resolve=>front.listen(18765,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});const results=[];
try{
  for(const [index,width] of [390,768,1440].entries()){
    clientIP='192.0.2.'+(220+index);const context=await browser.newContext({viewport:{width,height:960},reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',async response=>{if(response.url().includes('/api/')&&!response.ok())console.log('Fixture API',response.status(),await response.text().catch(()=>''));});
    assert.equal((await page.goto(origin)).status(),200);await page.evaluate(()=>document.fonts.ready);await page.locator('.hero-artwork img').evaluate(i=>i.decode());
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await page.locator('a[href*="dashboard.buattokosendiri"],a[href="/masuk/"],a[href="/daftar/"]').count(),0);
    assert.equal(await page.locator('.faq').count(),7);assert.equal(await page.locator('.steps .step').count(),5);
    if(width<901){await page.locator('.nav-toggle').click();assert.equal(await page.locator('.nav-toggle').getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');assert.equal(await page.locator('.nav-toggle').getAttribute('aria-expanded'),'false');}
    await page.screenshot({path:resolve(evidence,`landing-${width}.png`),fullPage:true});
    await page.locator('.hero-cta a[href="/pendaftaran"]').click();assert.equal(new URL(page.url()).pathname,'/pendaftaran');assert.equal((await page.reload()).status(),200);await page.evaluate(()=>document.fonts.ready);
    await page.getByRole('button',{name:'Lanjutkan'}).click();assert.equal(await page.locator('#fullName').getAttribute('aria-invalid'),'true');
    const email='browser-'+randomUUID()+'@example.test';await page.locator('#fullName').fill('Seller Sintetis');await page.locator('#email').fill(email);await page.locator('#whatsapp').fill('081234567890');
    await page.screenshot({path:resolve(evidence,`data-${width}.png`),fullPage:true});await page.getByRole('button',{name:'Lanjutkan'}).click();
    await page.locator('#storeName').fill('Toko Ceria Sintetis');await page.locator('#category').selectOption('Fashion');await page.locator('#noDomain').check();assert(await page.locator('#domain').isDisabled());await page.locator('#city').fill('Bandung');await page.locator('#description').fill('Pendaftaran uji sintetis.');
    await page.screenshot({path:resolve(evidence,`store-${width}.png`),fullPage:true});await page.getByRole('button',{name:'Lanjutkan'}).click();
    await page.getByRole('button',{name:'Ubah data seller'}).click();assert.equal(await page.locator('#email').inputValue(),email);await page.getByRole('button',{name:'Lanjutkan'}).click();assert.equal(await page.locator('#storeName').inputValue(),'Toko Ceria Sintetis');await page.getByRole('button',{name:'Lanjutkan'}).click();
    await page.getByRole('button',{name:'Selesaikan Pendaftaran'}).click();assert.equal(await page.locator('#consent').getAttribute('aria-invalid'),'true');await page.locator('#consent').check();
    await page.screenshot({path:resolve(evidence,`confirmation-${width}.png`),fullPage:true});
    // A failed API never displays success; next attempt uses the same idempotency key.
    await page.route('**/api/registration',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"REGISTRATION_UNAVAILABLE"}'}),{times:1});await page.getByRole('button',{name:'Selesaikan Pendaftaran'}).click();await page.locator('#form-error').waitFor({state:'visible'});assert(await page.locator('#success').isHidden());
    await page.getByRole('button',{name:'Selesaikan Pendaftaran'}).click();await page.locator('#success').waitFor({state:'visible'});assert.equal(await page.locator('#heading-4').textContent(),'Pendaftaran Berhasil!');const reference=await page.locator('#reference-code').textContent();assert.match(reference,/^BTOS-[A-F0-9]{24}$/);
    const row=await owner.query('SELECT reference_code,status FROM registration.entries WHERE email=$1',[email]);assert.equal(row.rowCount,1);assert.equal(row.rows[0].reference_code,reference);assert.equal(row.rows[0].status,'REGISTERED');
    assert(!page.url().includes(email));assert.equal((await context.cookies()).length,0);assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:resolve(evidence,`success-${width}.png`),fullPage:true});
    await page.getByRole('link',{name:'Lihat Panduan Lengkap'}).click();assert.equal(new URL(page.url()).pathname,'/panduan');assert(await page.getByRole('heading',{name:'Panduan Git Clone & Toko Mandiri'}).isVisible());
    assert.equal((await page.goto(origin+'/kebijakan-privasi')).status(),200);assert(await page.getByRole('link',{name:'m.rifatsyauqii@gmail.com'}).isVisible());
    assert.equal((await page.goto(origin+'/daftar/')).status(),200);assert.equal(new URL(page.url()).pathname,'/pendaftaran');
    assert.deepEqual(errors,[]);results.push({width,result:'PASS',database:'real isolated PostgreSQL',data:'synthetic',referenceCode:reference,noCookies:true,noPiiInURL:true});await context.close();
  }
  await writeFile(resolve(evidence,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();await new Promise(resolve=>front.close(resolve));await new Promise(resolve=>api.close(resolve));await pool.end();await owner.end();}
