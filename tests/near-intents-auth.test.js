import test from 'node:test';
import assert from 'node:assert/strict';
import { base58Encode, buildVersionedNonce } from '../near-intents-auth.js';

test('NEAR Intents nonce uses the version prefix, current salt, timestamp and 15 random bytes',()=>{
 const nonce=buildVersionedNonce({salt:'e110f317',timestampMs:1_700_000_000_000,randomBytes:target=>target.fill(7)});
 assert.equal(nonce.length,32);
 assert.deepEqual([...nonce.slice(0,9)],[86,40,246,198,0,225,16,243,23]);
 const view=new DataView(nonce.buffer);
 assert.equal(view.getBigUint64(9,true),1_700_000_000_000_000n);
 assert.deepEqual([...nonce.slice(17)],[...new Array(15).fill(7)]);
});

test('NEAR Intents signatures encode bytes as base58 with leading zeroes preserved',()=>{
 assert.equal(base58Encode(new Uint8Array([0])),'1');
 assert.equal(base58Encode(new Uint8Array([0,0,1])),'112');
 assert.equal(base58Encode(new Uint8Array([0x61])),'2g');
 assert.equal(base58Encode(new Uint8Array([0x62,0x62,0x62])),'a3gV');
});

test('invalid salts and timestamps are rejected',()=>{
 assert.throws(()=>buildVersionedNonce({salt:'1234',timestampMs:2,randomBytes:()=>{}}),/salt/);
 assert.throws(()=>buildVersionedNonce({salt:'e110f317',timestampMs:0,randomBytes:()=>{}}),/timestamp/);
});
