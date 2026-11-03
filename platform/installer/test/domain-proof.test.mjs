import test from 'node:test';
import assert from 'node:assert/strict';
import { createSocket } from 'node:dgram';
import { Resolver } from 'node:dns/promises';
import { lookupTxtOwnership } from '../src/domain-proof.mjs';

test('actual loopback DNS TXT lookup requires exact independent challenge value', async () => {
  const expected = 'jetseller-verification=' + 'a'.repeat(43), socket = createSocket('udp4');
  const queries = [];
  socket.on('message', (query, remote) => {
    let end=12; const labels=[];
    while(query[end]) {const size=query[end++];labels.push(query.subarray(end,end+size).toString());end+=size;}
    end+=5; queries.push(labels.join('.'));
    const header=Buffer.alloc(12);header.writeUInt16BE(query.readUInt16BE(0),0);header.writeUInt16BE(0x8180,2);header.writeUInt16BE(1,4);header.writeUInt16BE(1,6);
    const value=Buffer.from(expected), answer=Buffer.alloc(13);answer.writeUInt16BE(0xc00c,0);answer.writeUInt16BE(16,2);answer.writeUInt16BE(1,4);answer.writeUInt32BE(1,6);answer.writeUInt16BE(value.length+1,10);answer[12]=value.length;
    socket.send(Buffer.concat([header,query.subarray(12,end),answer,value]),remote.port,remote.address);
  });
  await new Promise(resolve=>socket.bind(0,'127.0.0.1',resolve));
  try {
    const resolver=()=>{const value=new Resolver({timeout:500,tries:1});value.setServers(['127.0.0.1:'+socket.address().port]);return value;};
    assert.equal(await lookupTxtOwnership('store.example',expected,{resolver:resolver()}),true);
    assert.equal(await lookupTxtOwnership('store.example','jetseller-verification='+'b'.repeat(43),{resolver:resolver()}),false);
    assert.deepEqual(queries,['_jetseller.store.example','_jetseller.store.example']);
  } finally {await new Promise(resolve=>socket.close(resolve));}
});
test('TXT fragments may join but partial, malformed and missing answers fail', async()=>{
  const value='jetseller-verification='+'a'.repeat(43);
  const cases=[
    {records:[[value.slice(0,20),value.slice(20)]],expected:true},
    {records:[[value+'extra']],expected:false},
    {records:[[value.slice(1)]],expected:false},
    {records:[],expected:false},
    {records:[[42]],expected:false},
  ];
  for(const {records,expected} of cases) {
    let cancelled=false;
    const resolver={resolveTxt:async()=>records,cancel(){cancelled=true;}};
    assert.equal(await lookupTxtOwnership('store.example',value,{resolver}),expected);assert.equal(cancelled,true);
  }
});
test('stalled DNS is bounded and cancelled; invalid names and values are not queried',async()=>{
  let cancelled=false,queries=0;
  const resolver={resolveTxt(){queries++;return new Promise(()=>{});},cancel(){cancelled=true;}};
  const started=Date.now();
  assert.equal(await lookupTxtOwnership('store.example','jetseller-verification='+'a'.repeat(43),{resolver,timeoutMs:25}),false);
  assert.ok(Date.now()-started<2000);assert.equal(cancelled,true);assert.equal(queries,1);
  await assert.rejects(lookupTxtOwnership('127.0.0.1','jetseller-verification='+'a'.repeat(43),{resolver}));
  assert.equal(await lookupTxtOwnership('store.example','invalid',{resolver}),false);assert.equal(queries,1);
});
