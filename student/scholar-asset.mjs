import { SCHOLAR_ASSET_KEY, SCHOLAR_ASSET_VERSION } from './scholar-asset-key.mjs';
const MAGIC=new TextEncoder().encode('YYC3D001');

export async function decodeScholarAsset(buffer){
  const bytes=new Uint8Array(buffer);
  if(bytes.length<36||!MAGIC.every((value,index)=>bytes[index]===value))throw new Error('Invalid character resource');
  const key=await crypto.subtle.importKey('raw',SCHOLAR_ASSET_KEY,'AES-GCM',false,['decrypt']);
  return crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(8,20),additionalData:MAGIC},key,bytes.slice(20));
}

export async function loadScholarAsset(url,signal){
  // The decoder and ciphertext must always be from the same release.
  const response=await fetch(url+'?v='+SCHOLAR_ASSET_VERSION,{signal});
  if(!response.ok)throw new Error('Character resource unavailable');
  return decodeScholarAsset(await response.arrayBuffer());
}
