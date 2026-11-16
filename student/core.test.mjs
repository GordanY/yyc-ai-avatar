import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CONFIG} from './config.mjs';
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
 assert.deepEqual(CONFIG.idleLoop,['nod','wave','greeting','spin']);
 assert.deepEqual(CONFIG.speakingLoop,['nod','explain','emphasis']);
 assert.ok(!CONFIG.speakingLoop.some(name=>['spin','greeting','wave'].includes(name)));
});
