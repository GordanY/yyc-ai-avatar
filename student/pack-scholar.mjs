// Package a locally baked model as an incorporated viewer resource.
// The client decoder material is public, not an account credential or DRM guarantee.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createCipheriv,randomBytes,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const source=await readFile(process.argv[2]);
if(source.subarray(0,4).toString()!=='glTF')throw new Error('Input must be a binary glTF intermediate');
const key=randomBytes(32),iv=randomBytes(12),magic=Buffer.from('YYC3D001');
const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(magic);
const encrypted=Buffer.concat([cipher.update(source),cipher.final()]);
const folder=path.join(here,'assets','scholar');await mkdir(folder,{recursive:true});
const packet=Buffer.concat([magic,iv,encrypted,cipher.getAuthTag()]);
await writeFile(path.join(folder,'character.yyc3d'),packet);
await writeFile(path.join(here,'scholar-asset-key.mjs'),
  '// Public viewer decoder material; not an account credential. Raw model sources remain local.\n'+
  'export const SCHOLAR_ASSET_KEY=new Uint8Array('+JSON.stringify([...key])+');\n'+
  'export const SCHOLAR_ASSET_VERSION='+JSON.stringify(createHash('sha256').update(packet).digest('hex').slice(0,16))+';\n');
console.log('Packed scholar viewer resource; raw GLB was not copied into the site.');
