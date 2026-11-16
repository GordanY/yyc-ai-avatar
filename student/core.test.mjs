import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CONFIG,MOVEMENTS} from './config.mjs';
import {TEMPLATES} from './templates.mjs';
import {normalizeApiKey} from './openrouter.mjs';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {decodeScholarAsset} from './scholar-asset.mjs';
import {wordCount,readQuota,consumeQuota,validateMessage,contextEstimate,systemPrompt,normalizeProfile,DEFAULT_PROFILE,actionFor} from './core.mjs';
function storage(){const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};}
test('200 English words accepted; 201 rejected; Han chars cannot bypass the limit',()=>{
 assert.equal(wordCount('word '.repeat(200)),200);
 assert.equal(validateMessage('word '.repeat(200),0,0),'');
 assert.ok(validateMessage('word '.repeat(201),0,0));
 assert.equal(wordCount('學'.repeat(201)),201);
 assert.ok(validateMessage('學'.repeat(201),0,0));
 assert.equal(wordCount('Hello 世界！'),3);
 assert.ok(validateMessage(' '.repeat(100),0,0));
 assert.ok(validateMessage('!'.repeat(4001),0,0));
});
test('API paste accepts a raw key, header, env assignment and copy-paste whitespace',()=>{
 const key='sk-or-v1-'+ 'a'.repeat(64);
 for(const input of [key,'  '+key+'  ','Authorization: Bearer "'+key+'"',"export OPENROUTER_API_KEY='"+key+"'",key.slice(0,25)+' \n\u200b'+key.slice(25)])assert.equal(normalizeApiKey(input),key);
 assert.equal(normalizeApiKey('opaque-token'),'opaque-token');
 assert.throws(()=>normalizeApiKey(' \n\u200b'));
 assert.throws(()=>normalizeApiKey('無效'));
});
test('packaged scholar decodes into a rigged animated model and rejects corruption',async()=>{
 globalThis.crypto??=webcrypto;
 const packed=await readFile(new URL('./assets/scholar/character.yyc3d',import.meta.url));
 assert.equal(packed.subarray(0,8).toString(),'YYC3D001');
 const bytes=Buffer.from(await decodeScholarAsset(packed));
 assert.equal(bytes.subarray(0,4).toString(),'glTF');
 const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 assert.ok(gltf.skins?.[0].joints.length>10);
 assert.deepEqual(gltf.animations.map(clip=>clip.name).sort(),['emphasis','explain','idle','nod','wave']);
 assert.ok(gltf.images.every(image=>image.bufferView!==undefined&&!image.uri));
 const corrupt=Buffer.from(packed);corrupt[corrupt.length-1]^=1;
 await assert.rejects(()=>decodeScholarAsset(corrupt));
 await assert.rejects(()=>decodeScholarAsset(new ArrayBuffer(36)));
});
test('quota is input-only and survives new reads/profile edits/context resets',()=>{
 const s=storage();assert.equal(readQuota(s),0);
 for(let i=1;i<=50;i++)assert.equal(consumeQuota(s),i);
 assert.equal(readQuota(s),50);
 normalizeProfile({name:'New agent'});
 assert.equal(readQuota(s),50);
 assert.throws(()=>consumeQuota(s));
});
test('unavailable or corrupted storage fails closed',()=>{
 assert.throws(()=>readQuota(null));
 assert.throws(()=>readQuota({getItem:()=>'-1'}));
});
test('context includes role settings, background knowledge, user AND assistant messages',()=>{
 const p=normalizeProfile(DEFAULT_PROFILE),base=contextEstimate(p,[]);
 assert.ok(contextEstimate({...p,knowledge:p.knowledge+'學'.repeat(100)},[])>base);
 assert.ok(contextEstimate(p,[{role:'user',content:'hello'},{role:'assistant',content:'world'}])>base);
 assert.ok(validateMessage('hello',0,CONFIG.contextWindow-CONFIG.replyTokens));
 assert.ok(systemPrompt(p).includes(p.name));
});
test('invalid profile values are constrained and action mapping is allowlisted',()=>{
 const p=normalizeProfile({avatar:'anything',tone:'unknown',personalities:['親切','bad'],name:'a'.repeat(100)});
 assert.equal(p.avatar,'school');assert.deepEqual(p.personalities,['親切']);assert.equal(p.name.length,40);
 assert.equal(actionFor('你好'),'wave');assert.equal(actionFor('多謝'),'nod');assert.equal(actionFor('arbitrary text'),'idle');
});

test('teacher motion selections match the chosen idle and text-reply groups',()=>{
 assert.deepEqual(CONFIG.idleLoop,['nod','wave','greeting']);
 assert.deepEqual(CONFIG.speakingLoop,['nod','explain','emphasis']);
 assert.ok(!CONFIG.speakingLoop.some(name=>['spin','greeting','wave'].includes(name)));
});
test('movement preview numbers are stable and do not change the automatic groups',()=>{
 assert.deepEqual(MOVEMENTS.map(movement=>movement.number),[1,2,3,5,13,14]);
 assert.equal(new Set(MOVEMENTS.map(movement=>movement.id)).size,MOVEMENTS.length);
 for(const action of [...CONFIG.idleLoop,...CONFIG.speakingLoop])assert.ok(MOVEMENTS.some(movement=>movement.id===action));
});
test('Yue Fei template supplies a complete editable profile with source-backed knowledge',()=>{
 const template=TEMPLATES['yue-fei'],profile=normalizeProfile(template.profile);
 assert.equal(profile.name,'岳飛');assert.equal(profile.avatar,'scholar');assert.equal(profile.tone,'正式有禮');
 assert.deepEqual(profile.personalities,['忠誠','勇敢','嚴謹','耐心']);
 assert.match(profile.knowledge,/1103–1142/);assert.match(profile.knowledge,/字鵬舉/);assert.match(profile.knowledge,/小說/);
 assert.equal(template.sources.length,3);assert.ok(profile.knowledge.length<CONFIG.maxKnowledgeChars);
 profile.personalities.pop();assert.equal(template.profile.personalities.length,4);
});
