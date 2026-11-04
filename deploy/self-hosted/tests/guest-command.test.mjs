import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {execFileSync} from 'node:child_process';
import {runGuestCommand} from './guest-command.mjs';

test('guest HTTP callbacks require a responsive parent event loop',async()=>{
 let calls=0;
 const server=createServer((req,res)=>{calls++;res.end('verified synthetic response');});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const script=`const h=require('node:http');const q=h.get('http://127.0.0.1:${server.address().port}',r=>{r.pipe(process.stdout)});q.setTimeout(300,()=>{q.destroy();process.exit(7)});q.on('error',()=>process.exit(7));`;
 try {
  // Reproduce the old driver: the parent cannot answer its own child request.
  assert.throws(()=>execFileSync(process.execPath,['-e',script],{stdio:'pipe',timeout:5000}),e=>e.status===7);
  assert.equal(calls,0);
  const output=await runGuestCommand(process.execPath,['-e',script]);
  assert.equal(output,'verified synthetic response');
  assert.ok(calls>=1);
 } finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('guest input and failure diagnostics remain bounded and private',async()=>{
 assert.equal(await runGuestCommand(process.execPath,['-e','process.stdin.pipe(process.stdout)'],'synthetic input'),'synthetic input');
 await assert.rejects(runGuestCommand(process.execPath,['-e',"process.stdout.write('VM_CHECKPOINT next=0 reported=0');process.exit(1)"]),e=>e.code===1&&e.message==='Guest command failed'&&e.stdout==='VM_CHECKPOINT next=0 reported=0');
 await assert.rejects(runGuestCommand(process.execPath,['-e',"process.stdout.write('x'.repeat(2048))"],undefined,{maxBuffer:64}));
});
