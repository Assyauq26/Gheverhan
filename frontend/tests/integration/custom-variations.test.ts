import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { ALL_PERMISSIONS } from "../../src/lib/auth/permissions";
import { generateCombinations, combinationKey } from "../../src/modules/catalog/variation-domain";
const target = new URL(process.env.SPRINT1_TEST_DATABASE_URL || "http://invalid");
assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
assert.equal(target.pathname, "/gheverhan_sprint1_test");
assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
process.env.DATABASE_URL=target.toString(); process.env.DIRECT_URL=target.toString();
let db: PrismaClient, svc: typeof import("../../src/modules/catalog/product-management.service");
let actor: { id: string; permissions: string[]; isAdmin: boolean };
const prefix=randomUUID();
before(async()=>{ db=(await import("../../src/lib/prisma")).prisma; svc=await import("../../src/modules/catalog/product-management.service"); const user=await db.user.create({data:{name:"Dummy operator",email:prefix+"@example.test",passwordHash:"dummy"}});actor={id:user.id,permissions:[...ALL_PERMISSIONS],isAdmin:true}; });
after(async()=>{await db?.$disconnect();});
function input(groupCount=2) {
 const groups=Array.from({length:groupCount},(_,i)=>({id:randomUUID(),name:["Warna","Ukuran","Model"][i],allowsImage:i===0,values:[0,1].map(j=>({id:randomUUID(),value:i===0?["Merah","Hijau"][j]:i===1?["M","L"][j]:["Reguler","Oversized"][j],imageId:null}))}));
 return { optionsEnabled:true, name:"Produk dummy variasi",slug:"variasi-"+randomUUID(),basePrice:100000,images:[],optionImages:[],optionGroups:groups,variants:generateCombinations(groups).map(optionValueIds=>({sku:"GH-"+randomUUID(),optionValueIds,color:"",size:"",price:null,salePrice:null,onHand:3}))};
}
async function create(groupCount=2) {const value=input(groupCount), result=await svc.createManagedProduct(actor,value); return {value,product:await svc.getManagedProduct(actor,result.id)};}

test("custom variations persistence, safety and legacy compatibility",async t=>{
 await t.test("one/two/three group products persist exact stable selections",async()=>{
  for(const count of [1,2,3]) {const {product}=await create(count);assert.equal(product.optionsEnabled,true);assert.equal(product.optionGroups.length,count);assert.equal(product.variants.length,2**count);for(const v of product.variants){assert.equal(v.optionValueIds.length,count);assert.ok(v.id);}}
 });
 await t.test("rename and reorder preserve variant IDs, SKUs, prices and inventory",async()=>{
  const {product}=await create();const before=await db.productVariant.findMany({where:{productId:product.id},include:{inventory:true},orderBy:{id:"asc"}});
  const changed=structuredClone(product);changed.optionGroups.reverse();changed.optionGroups[0].name="Kapasitas";changed.optionGroups[0].values.reverse();changed.optionGroups[0].values[0].value="Besar";
  await svc.updateManagedProduct(actor,product.id,product.updatedAt,changed);
  assert.deepEqual(await db.productVariant.findMany({where:{productId:product.id},include:{inventory:true},orderBy:{id:"asc"}}),before);
  const after=await svc.getManagedProduct(actor,product.id);assert.equal(after.optionGroups[0].name,"Kapasitas");assert.equal(after.optionGroups[0].values[0].value,"Besar");
 });
 await t.test("image mapping survives rename/reorder and transfer only unlinks mappings",async()=>{
  const {product}=await create();const image=await db.productImage.create({data:{productId:product.id,url:"/dummy-local-only.png",isVariation:true}});
  product.optionImages.push({id:image.id,url:image.url,alt:"Merah"});product.optionGroups[0].values[0].imageId=image.id;
  await svc.updateManagedProduct(actor,product.id,product.updatedAt,product);
  const after=await svc.getManagedProduct(actor,product.id);assert.equal(after.optionGroups[0].values[0].imageId,image.id);
  after.optionGroups[0].allowsImage=false;after.optionGroups[0].values.forEach(v=>v.imageId=null);after.optionGroups[1].allowsImage=true;
  await svc.updateManagedProduct(actor,after.id,after.updatedAt,after);
  assert.ok(await db.productImage.findUnique({where:{id:image.id}}));
 });
 await t.test("foreign group/value/image IDs and client combination reassignment fail closed",async()=>{
  const a=await create(),b=await create();const proposed=structuredClone(a.product);proposed.optionGroups[0].id=b.product.optionGroups[0].id;
  await assert.rejects(svc.updateManagedProduct(actor,proposed.id,proposed.updatedAt,proposed),{status:422});
  const changed=structuredClone(a.product);changed.variants[0].optionValueIds=changed.variants[1].optionValueIds;
  await assert.rejects(svc.updateManagedProduct(actor,changed.id,changed.updatedAt,changed),{status:422});
  const foreignImage=await db.productImage.create({data:{productId:b.product.id,url:"/dummy-foreign.png",isVariation:true}});
  const image=structuredClone(a.product);image.optionGroups[0].values[0].imageId=foreignImage.id;
  await assert.rejects(svc.updateManagedProduct(actor,image.id,image.updatedAt,image),{status:422});
  assert.equal((await svc.getManagedProduct(actor,a.product.id)).updatedAt,a.product.updatedAt);
 });
 await t.test("database constraints reject multiple image groups, foreign relation and spoofed combination key",async()=>{
  const {product}=await create();await assert.rejects(db.productOptionGroup.update({where:{id:product.optionGroups[1].id},data:{allowsImage:true}}));
  await assert.rejects(db.productVariant.update({where:{id:product.variants[0].id},data:{combinationKey:"unrelated"}}));
  const other=await create();await assert.rejects(db.productOptionValue.update({where:{id:product.optionGroups[0].values[0].id},data:{productId:other.product.id}}));
 });
 await t.test("concurrent image-mode transfers permit only one version and preserve the database invariant",async()=>{
  const {product}=await create(3);const one=structuredClone(product),two=structuredClone(product);
  for(const [draft,index]of [[one,1],[two,2]]as const){draft.optionGroups.forEach(g=>g.allowsImage=false);draft.optionGroups[index].allowsImage=true;}
  const results=await Promise.allSettled([svc.updateManagedProduct(actor,product.id,product.updatedAt,one),svc.updateManagedProduct(actor,product.id,product.updatedAt,two)]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(await db.productOptionGroup.count({where:{productId:product.id,allowsImage:true}}),1);
 });
 await t.test("stock and cart history protect removed SKUs; update and inventory rollback atomically",async()=>{
  const {product}=await create();const changed=structuredClone(product);changed.variants.pop();
  await assert.rejects(svc.updateManagedProduct(actor,product.id,product.updatedAt,changed),{status:409});
  assert.equal(await db.productVariant.count({where:{productId:product.id}}),4);
  const reader={...actor,permissions:["product.read","product.update"]};const quantity=structuredClone(product);quantity.variants[0].onHand=20;
  await assert.rejects(svc.updateManagedProduct(reader,product.id,product.updatedAt,quantity),{status:403});
  assert.equal((await svc.getManagedProduct(actor,product.id)).variants[0].onHand,3);
 });
 await t.test("legacy backfill is idempotent and conversion preserves referenced stock variant IDs",async()=>{
  const value={name:"Legacy dummy",slug:"legacy-"+randomUUID(),basePrice:1000,images:[],variants:[{sku:"LEG-"+randomUUID(),color:"Merah",size:"M",onHand:2}]};
  const created=await svc.createManagedProduct(actor,value);const before=await db.productVariant.findFirstOrThrow({where:{productId:created.id},include:{inventory:true}});
  for(let i=0;i<2;i++)await db.$queryRaw`SELECT gheverhan_backfill_legacy_options(${created.id}::text)::text`;
  assert.deepEqual(await db.productVariant.findFirstOrThrow({where:{productId:created.id},include:{inventory:true}}),before);
  const managed=await svc.getManagedProduct(actor,created.id);assert.equal(managed.optionsEnabled,false);assert.equal(managed.optionGroups.length,2);
  managed.optionsEnabled=true;
  await svc.updateManagedProduct(actor,created.id,managed.updatedAt,managed);
  assert.equal((await svc.getManagedProduct(actor,created.id)).variants[0].id,before.id);assert.equal((await svc.getManagedProduct(actor,created.id)).variants[0].onHand,2);
 });
 await t.test("unauthorized operators cannot mutate products or acquire stock privileges",async()=>{
  await assert.rejects(svc.createManagedProduct({...actor,isAdmin:false},input()),{status:403});
  await assert.rejects(svc.createManagedProduct({...actor,permissions:["product.create"]},input()),{status:403});
 });
});
