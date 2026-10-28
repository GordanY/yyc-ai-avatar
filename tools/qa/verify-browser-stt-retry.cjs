const {chromium}=require('/Users/gordanyeung/.npm/_npx/84539a01c0e4c364/node_modules/playwright');
const fs=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture=/Users/gordanyeung/vs-code-project/ai-avatar/amica/working/manual-mic-fixture.wav%noloop']});
 const page=await browser.newPage({viewport:{width:1280,height:900},permissions:['microphone']});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  for(const[k,v]of Object.entries({vrm_url:'/vrm/YYC_InfoDay.vrm',vrm_save_type:'web',animation_url:'/animations/yyc/YYC_idle.vrma',animation_procedural:'false',show_introduction:'false',stt_backend:'whisper_browser',autosend_from_mic:'false',chatbot_backend:'echo',tts_backend:'none',amica_life_enabled:'false'}))localStorage.setItem('chatvrm_'+k,v);
  const Native=window.Worker;window.__workerInstances=0;window.__workerAttempts=0;window.__workerTerminated=0;
  window.Worker=function(url,options){
   if(!String(url).includes('whisper'))return new Native(url,options);
   window.__workerInstances++;return {onmessage:null,onerror:null,onmessageerror:null,terminate(){window.__workerTerminated++;},postMessage(data){window.__workerAttempts++;const attempt=window.__workerAttempts;this.onmessage?.({data:{status:'initiate'}});this.onmessage?.({data:{status:'progress',file:'manual-stt-test.onnx',progress:42}});setTimeout(()=>{if(attempt===1)this.onerror?.({message:'Worker module load failed',preventDefault(){}});else this.onmessage?.({data:{status:'complete',data:{text:'Recovered whole manual recording',chunks:[]}}});},40);}};
  };
 });
 await page.route('**/api/dataHandler?type=config',r=>r.request().method()==='POST'?r.fulfill({status:200,contentType:'application/json',body:'{}'}):r.continue());
 await page.goto('http://localhost:3000');await page.getByRole('button',{name:'Start recording',exact:true}).waitFor({timeout:60000});const close=page.getByRole('button',{name:'Close',exact:true});if(await close.count())await close.click();
 await page.getByRole('button',{name:'Start recording',exact:true}).click();await page.getByRole('button',{name:'Stop recording',exact:true}).waitFor();await page.waitForTimeout(1400);await page.getByRole('button',{name:'Stop recording',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Worker module load failed'}).first().waitFor({timeout:30000});assert(await page.getByRole('button',{name:'Start recording',exact:true}).isEnabled());assert.equal(await page.evaluate(()=>window.__workerAttempts),1);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.chatvrm_loading_progress?.['manual-stt-test.onnx']),undefined,'failed STT download progress must clear');
 await page.screenshot({path:'output/playwright/manual-recording/browser-stt-error-unlocked.png'});
 await page.getByRole('button',{name:'Start recording',exact:true}).click();await page.getByRole('button',{name:'Stop recording',exact:true}).waitFor();await page.waitForTimeout(1400);await page.getByRole('button',{name:'Stop recording',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('input[aria-label="Message"]')?.value==='Recovered whole manual recording',null,{timeout:30000});assert(await page.getByRole('button',{name:'Start recording',exact:true}).isEnabled());
 assert.equal(await page.evaluate(()=>window.chatvrm_loading_progress?.['manual-stt-test.onnx']),undefined);const state=await page.evaluate(()=>({instances:window.__workerInstances,attempts:window.__workerAttempts,terminated:window.__workerTerminated}));assert.equal(state.instances,2);assert.equal(state.attempts,2);assert(state.terminated>=1);assert.equal(errors.length,0);
 await page.screenshot({path:'output/playwright/manual-recording/browser-stt-retry-success.png'});const report={...state,pageErrors:errors,checks:['Browser worker load error surfaced','Record unlocked after load error','Next explicit recording creates a fresh worker','Retry succeeds without page reload'],limitation:'Worker failure/success messages are injected to exercise UI recovery; real pipeline-cache retry is independently covered by whisperWorker.spec.ts.'};fs.writeFileSync('output/playwright/manual-recording/browser-stt-retry-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
