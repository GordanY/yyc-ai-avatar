const fs=require('node:fs');
const assert=require('node:assert/strict');
const {WaveFile}=require('wavefile');
const {chromium}=require('/Users/gordanyeung/.npm/_npx/84539a01c0e4c364/node_modules/playwright');
(async()=>{
 const dir='output/playwright/stop-voice';fs.mkdirSync(dir,{recursive:true});
 const fixture=new WaveFile(fs.readFileSync('output/playwright/motion/explanation.wav'));
 const samples=fixture.getSamples(true,Float64Array);const extended=new Float64Array(samples.length*4);for(let i=0;i<4;i++)extended.set(samples,i*samples.length);
 fixture.fromScratch(1,fixture.fmt.sampleRate,'16',extended);const wav=Buffer.from(fixture.toBuffer());
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
 const context=await browser.newContext({viewport:{width:1280,height:900}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{for(const[k,v]of Object.entries({vrm_url:'/vrm/YYC_InfoDay.vrm',vrm_save_type:'web',animation_url:'/animations/yyc/YYC_idle.vrma',animation_procedural:'false',show_introduction:'false',stt_backend:'whispercpp',chatbot_backend:'echo',tts_backend:'piper',piper_url:'http://localhost:3000/__stop_tts',tts_muted:'false',amica_life_enabled:'false'}))localStorage.setItem('chatvrm_'+k,v)});
 await page.route(u=>u.pathname.replace(/\/$/,'')==='/api/dataHandler'&&u.searchParams.get('type')==='config',r=>r.request().method()==='POST'?r.fulfill({status:200,contentType:'application/json',body:'{}'}):r.continue());
 await page.route('**/__stop_tts?*',r=>r.fulfill({status:200,contentType:'audio/wav',body:wav}));
 await page.goto('http://localhost:3000');
 await page.waitForFunction(()=>{const c=document.querySelector('canvas');if(!c)return false;let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber'))];while(f){for(let d=f.dependencies?.firstContext;d;d=d.next)if(d.memoizedValue?.chat?.viewer?.model?.vrm){window.stopReview={bot:d.memoizedValue.chat};return true;}f=f.return;}return false;},null,{timeout:60000});
 const close=page.getByRole('button',{name:'Close',exact:true});if(await close.count())await close.click();
 const input=page.getByRole('textbox',{name:'Message',exact:true});const stop=page.getByRole('button',{name:'Stop voice',exact:true});const send=page.getByRole('button',{name:'Send message',exact:true});
 // Stop before response headers arrive; the late body must be cancelled.
 await page.evaluate(()=>{const r=stopReview,b=r.bot;r.processing=false;const setter=b.setChatProcessing;b.setChatProcessing=v=>{r.processing=v;setter(v)};b.getChatResponseStream=()=>new Promise(resolve=>{r.resolveLate=resolve});});
 await input.fill('First question');await send.click();await page.waitForFunction(()=>stopReview.processing&&stopReview.resolveLate);
 await input.fill('My next question');await stop.click();assert.equal(await input.inputValue(),'My next question');assert(await send.isEnabled());assert(await input.evaluate(el=>document.activeElement===el));
 await page.evaluate(()=>{stopReview.resolveLate(new ReadableStream({start(c){c.enqueue('[neutral] Old response that must never speak.');c.close()},cancel(){stopReview.lateCancelled=true;}}));});
 await page.waitForFunction(()=>stopReview.lateCancelled);assert(await send.isEnabled());
 // Use the actual TTS queue, model audio clock, and gesture planner.
 await page.evaluate(()=>{const r=stopReview,b=r.bot;r.intents=[];r.timer=setInterval(()=>{const s=b.viewer.model.speechState;if(s.intent&&!r.intents.includes(s.intent))r.intents.push(s.intent)},20);b.ttsJobs.enqueue({screenplay:{text:'學校設有不同課程，學生參與校園活動。課堂讓同學學習新知識，學會與人合作。',expression:'neutral',talk:{style:'talk',message:'學校設有不同課程，學生參與校園活動。課堂讓同學學習新知識，學會與人合作。'}},streamIdx:b.currentStreamIdx});});
 await page.waitForFunction(()=>stopReview.bot.viewer.model.speechState.playing);
 await page.waitForFunction(()=>['explanation','agreement','emphasis'].every(i=>stopReview.intents.includes(i)),null,{timeout:14000});
 await page.screenshot({path:dir+'/speaking.png'});
 // Seed additional queued audio; one click must stop playback and remove it all.
 await page.evaluate(()=>{const b=stopReview.bot;b.speakJobs.enqueue({audioBuffer:null,screenplay:{text:'Queued stale speech',expression:'neutral',talk:{style:'talk',message:'Queued stale speech'}},streamIdx:b.currentStreamIdx});});
 const clickAt=Date.now();await stop.click();await page.waitForFunction(()=>!stopReview.bot.viewer.model.speechState.playing);const stoppedWithinMs=Date.now()-clickAt;
 assert(await send.isEnabled());assert(await page.getByRole('button',{name:'Start recording',exact:true}).isEnabled());assert.equal(await input.inputValue(),'My next question');
 await page.waitForTimeout(1600);
 const final=await page.evaluate(()=>{const r=stopReview,b=r.bot;clearInterval(r.timer);return{intents:r.intents,state:b.viewer.model.speechState,ttsJobs:b.ttsJobs.size(),speakJobs:b.speakJobs.size(),lateCancelled:r.lateCancelled,processing:r.processing};});
 assert(!final.state.playing);assert.equal(final.state.intent,null);assert.equal(final.ttsJobs,0);assert.equal(final.speakJobs,0);assert(!final.processing);
 // Sending the preserved draft starts a fresh response immediately.
 await page.evaluate(()=>{stopReview.bot.getChatResponseStream=async()=>new ReadableStream({start(c){c.enqueue('[neutral] Ready for a fresh question.');c.close()}})});
 await send.click();await page.waitForFunction(()=>stopReview.bot.viewer.model.speechState.playing);await stop.click();
 const layouts=[];await input.fill('Ready for the next question');
 for(const width of [375,768,1280]){await page.setViewportSize({width,height:900});const boxes=[];for(const button of [stop,send,page.getByRole('button',{name:'Start recording',exact:true})]){const box=await button.boundingBox();assert(box.width>=44&&box.height>=44);assert(box.x>=0&&box.x+box.width<=width+1);boxes.push(box)}layouts.push({width,boxes});await page.screenshot({path:dir+'/ready-'+width+'.png'});}
 assert.equal(errors.length,0,errors.join('; '));const result={...final,stoppedWithinMs,layouts,errors,checks:['Visible Stop voice button cancels actual playback and queues','Typed draft stays intact and focused','Late response before headers cannot restart speech','Fresh message can be sent and played immediately','Microphone ready after Stop','Ordinary Cantonese speech renders explanation, nod, and emphasis','Buttons fit 375/768/1280 widths'],fixture:'Deterministic WAV response replaces TTS transport; real Chat queue, audio playback, model, and viewer run normally.'};fs.writeFileSync(dir+'/report.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close()}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
