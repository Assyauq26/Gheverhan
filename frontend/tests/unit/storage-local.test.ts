import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, mkdir, symlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getLocalObject, putLocalObject, removeLocalObject } from "@/lib/storage-local";
const object = "gheverhan/product-images/p1/12345678-1234-1234-1234-123456789abc.png";
let root: string;
let old: string | undefined;
beforeEach(async () => { old=process.env.STORAGE_LOCAL_ROOT; root=await mkdtemp(path.join(tmpdir(),"storage-test-")); process.env.STORAGE_LOCAL_ROOT=root; });
afterEach(async () => { if(old===undefined) delete process.env.STORAGE_LOCAL_ROOT; else process.env.STORAGE_LOCAL_ROOT=old; await rm(root,{recursive:true,force:true}); });
describe("private local storage",()=>{
  it("round trips and removes objects without overwriting an existing upload",async()=>{
    const data=new Uint8Array([1,2,3]);
    await putLocalObject(object,"gheverhan",data,"image/png");
    await expect(putLocalObject(object,"gheverhan",data,"image/png")).rejects.toThrow();
    expect(await getLocalObject(object,"gheverhan")).toEqual({data,contentType:"image/png"});
    await removeLocalObject(object,"gheverhan");
    await expect(getLocalObject(object,"gheverhan")).rejects.toThrow();
    await removeLocalObject(object,"gheverhan");
  });
  it("rejects traversal, mismatched types and oversized uploads",async()=>{
    await expect(putLocalObject("../outside","gheverhan",new Uint8Array([1]),"image/png")).rejects.toThrow();
    await expect(putLocalObject(object,"gheverhan",new Uint8Array([1]),"image/jpeg")).rejects.toThrow();
    await expect(putLocalObject(object,"gheverhan",new Uint8Array(4*1024*1024+1),"image/png")).rejects.toThrow();
  });
  it("refuses symlink directories and files",async()=>{
    await symlink(tmpdir(),path.join(root,"gheverhan"));
    await expect(putLocalObject(object,"gheverhan",new Uint8Array([1]),"image/png")).rejects.toThrow();
    await rm(path.join(root,"gheverhan"));
    await mkdir(path.dirname(path.join(root,object)),{recursive:true});
    const sentinel=path.join(root,"sentinel");
    const {writeFile}=await import("node:fs/promises");
    await writeFile(sentinel,"private");
    await symlink(sentinel,path.join(root,object));
    await expect(getLocalObject(object,"gheverhan")).rejects.toThrow();
    await expect(removeLocalObject(object,"gheverhan")).rejects.toThrow();
    expect(await readFile(sentinel,"utf8")).toBe("private");
  });
});
