const BASE58_ALPHABET='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Encode(bytes){
 let value=0n;
 for(const byte of bytes)value=(value<<8n)|BigInt(byte);
 let encoded='';
 while(value>0n){const remainder=Number(value%58n);encoded=BASE58_ALPHABET[remainder]+encoded;value/=58n;}
 for(const byte of bytes){if(byte!==0)break;encoded='1'+encoded;}
 return encoded||'1';
}

export function buildVersionedNonce({salt,timestampMs=Date.now(),randomBytes}){
 if(typeof salt!=='string'||! /^[0-9a-f]{8}$/i.test(salt))throw new TypeError('NEAR Intents salt must be 4 bytes encoded as hex.');
 if(!Number.isSafeInteger(timestampMs)||timestampMs<=0)throw new RangeError('Nonce timestamp must be a positive millisecond timestamp.');
 const nonce=new Uint8Array(32);
 nonce.set([86,40,246,198,0],0);
 nonce.set(Uint8Array.from(salt.match(/../g),byte=>parseInt(byte,16)),5);
 const view=new DataView(nonce.buffer);
 view.setBigUint64(9,BigInt(timestampMs)*1000n,true);
 const entropy=randomBytes||((target)=>crypto.getRandomValues(target));
 entropy(nonce.subarray(17));
 return nonce;
}
