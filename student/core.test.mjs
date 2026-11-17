import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CONFIG,MOVEMENTS} from './config.mjs';
import {TEMPLATES} from './templates.mjs';
import {starterQuestions,parseChatReply,FOLLOWUP_MARKER} from './followups.mjs';
import {readChatCompletion,completionDiagnostics,requestChatCompletion} from './chat-completion.mjs';
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
test('initial questions follow the applied character and are independent copies',()=>{
 assert.deepEqual(starterQuestions(DEFAULT_PROFILE),['你可以怎樣幫助我？','你最擅長甚麼？']);
 const questions=starterQuestions(TEMPLATES['yue-fei'].profile);
 assert.deepEqual(questions,['岳家軍有甚麼特色？','你重視哪些品格？']);
 questions.pop();assert.equal(starterQuestions(TEMPLATES['yue-fei'].profile).length,2);
});
test('reply parser separates contextual questions and always returns two short choices',()=>{
 const parsed=parseChatReply('每天練習能培養毅力。\n'+FOLLOWUP_MARKER+'\n["可以怎樣訂目標？","如何保持動力？"]');
 assert.equal(parsed.reply,'每天練習能培養毅力。');assert.deepEqual(parsed.questions,['可以怎樣訂目標？','如何保持動力？']);
 const invalid=parseChatReply('回答。\n'+FOLLOWUP_MARKER+'\n'+JSON.stringify([null,'？','同一題？','同一題?','長'.repeat(50)]));
 assert.equal(invalid.questions.length,2);assert.equal(invalid.questions[0],'同一題？');assert.ok(invalid.questions.every(q=>q.length<=64));
 assert.deepEqual(parseChatReply('簡單回答。').questions,['可以再解釋一下嗎？','你能舉個例子嗎？']);
 assert.equal(parseChatReply('完整回答。\n'+FOLLOWUP_MARKER+'\n["未完成').reply,'完整回答。');
 assert.equal(parseChatReply('完整回答。\n[[FOLLOW_UP_QUEST').reply,'完整回答。');
 assert.equal(parseChatReply('完整回答。\n[[FOLLOW_UP_QUESTIONS]').reply,'完整回答。');
 assert.deepEqual(parseChatReply('4','二加二是多少？').questions,['可以再解釋一下嗎？','你能舉個例子嗎？']);
 assert.deepEqual(parseChatReply('4','What is two plus two?').questions,['Can you explain that more?','Can you give an example?']);
 assert.throws(()=>parseChatReply(FOLLOWUP_MARKER+'\n["只剩問題？","沒有答案？"]'));
});
test('literal marker mentions remain in the answer and only the final standalone block is metadata',()=>{
 const body='這是格式標記 '+FOLLOWUP_MARKER+' 的文字解釋。\n正文仍有內容。';
 const parsed=parseChatReply(body+'\n'+FOLLOWUP_MARKER+'\n["你能舉例嗎？","如何使用？"]');
 assert.equal(parsed.reply,body);assert.deepEqual(parsed.questions,['你能舉例嗎？','如何使用？']);
 assert.equal(parseChatReply(body).reply,body);
 const example='範例：\n'+FOLLOWUP_MARKER+'\n["例子？"]\n這些仍是答案正文。';
 assert.equal(parseChatReply(example+'\n'+FOLLOWUP_MARKER+'\n["你能舉例嗎？","如何使用？"]').reply,example);
 const lower=parseChatReply('正常回答。\n'+FOLLOWUP_MARKER.toLowerCase()+'\n["還有甚麼？","可以解釋嗎？"]');
 assert.equal(lower.reply,'正常回答。');assert.deepEqual(lower.questions,['還有甚麼？','可以解釋嗎？']);
});
test('chat completion reads text parts and never presents private reasoning as an answer',()=>{
 assert.equal(readChatCompletion({choices:[{message:{content:[{type:'text',text:'答案一。'},{type:'image_url',image_url:{url:'private'}},{type:'output_text',text:'答案二。'}]}}]}).reply,'答案一。\n答案二。');
 assert.equal(readChatCompletion({choices:[{message:{content:null,refusal:'無法協助這個要求。'}}]}).reply,'無法協助這個要求。');
 const data={choices:[{finish_reason:'length',message:{content:null,reasoning:'PRIVATE',reasoning_details:[{text:'PRIVATE'}]}}],usage:{completion_tokens:800,completion_tokens_details:{reasoning_tokens:800}}};
 assert.throws(()=>readChatCompletion(data),error=>/思考/.test(error.message)&&error.completionDiagnostics.reasoningTokens===800);
 assert.ok(!JSON.stringify(completionDiagnostics(data)).includes('PRIVATE'));
 assert.throws(()=>readChatCompletion({error:{code:500,message:'private provider internals'}}),/供應商未能/);
 assert.throws(()=>readChatCompletion({choices:[{finish_reason:'stop',message:{content:''}}]}),/沒有回傳文字/);
 assert.equal(CONFIG.replyTokens,8192);assert.equal(CONFIG.responseTimeoutMs,120000);
});
test('chat deadline covers body reading and is cleared before reply presentation',async()=>{
 const controller=new AbortController();
 const fetcher=async(url,options)=>({ok:true,json:()=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}))});
 await assert.rejects(()=>requestChatCompletion({model:CONFIG.model},'dummy-test-key',{controller,timeoutMs:10,fetcher}),{name:'AbortError'});
 const successful=new AbortController();
 await requestChatCompletion({},'dummy-test-key',{controller:successful,timeoutMs:10,fetcher:async()=>({ok:true,json:async()=>({choices:[{message:{content:'正常答案'}}]})})});
 await new Promise(resolve=>setTimeout(resolve,20));assert.equal(successful.signal.aborted,false);
});
