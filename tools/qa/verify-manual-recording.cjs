const { chromium } = require('/Users/gordanyeung/.npm/_npx/84539a01c0e4c364/node_modules/playwright');
const { WaveFile } = require('wavefile');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({ channel:'chrome',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture=/Users/gordanyeung/vs-code-project/ai-avatar/amica/working/manual-mic-fixture.wav%noloop','--autoplay-policy=no-user-gesture-required'] });
 const context=await browser.newContext({viewport:{width:1280,height:900},permissions:['microphone']});
 const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let requests=[];
 await page.addInitScript(()=>{for(const [k,v]of Object.entries({vrm_url:'/vrm/YYC_InfoDay.vrm',vrm_save_type:'web',animation_url:'/animations/yyc/YYC_idle.vrma',animation_procedural:'false',show_introduction:'false',stt_backend:'whispercpp',whispercpp_url:'http://localhost:3000/manual-stt',autosend_from_mic:'false',chatbot_backend:'echo',tts_backend:'none',amica_life_enabled:'false'}))localStorage.setItem('chatvrm_'+k,v);});
 await page.route('**/api/dataHandler?type=config',r=>r.request().method()==='POST'?r.fulfill({status:200,contentType:'application/json',body:'{}'}):r.continue());
 await page.route('**/manual-stt/inference',async route=>{
  const body=route.request().postDataBuffer();const start=body.indexOf(Buffer.from('RIFF'));assert(start>=0);
  const bytes=body.subarray(start,start+8+body.readUInt32LE(start+4));const wav=new WaveFile(bytes);let values=wav.getSamples(true,Float32Array);if(Array.isArray(values))values=values[0];
  const divisor=wav.fmt.bitsPerSample===16?32768:1;
  const step=1600, voiced=[];for(let p=0;p<values.length;p+=step){let sum=0,n=0;for(let i=p;i<Math.min(values.length,p+step);i++){sum+=(values[i]/divisor)**2;n++;}voiced.push(Math.sqrt(sum/n));}
  const active=voiced.map((v,i)=>v>.008?i/10:-1).filter(v=>v>=0);
  const result={duration:values.length/wav.fmt.sampleRate,sampleRate:wav.fmt.sampleRate,channels:wav.fmt.numChannels,bits:wav.fmt.bitsPerSample,firstActive:active[0],lastActive:active.at(-1),midPauseRms:voiced.slice(45,105).reduce((s,v)=>s+v,0)/60,bodyBytes:bytes.length};requests.push(result);
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'First sentence before the pause. These are my final spoken words.'})});
 });
 await page.goto('http://localhost:3000');await page.getByRole('button',{name:'Start recording',exact:true}).waitFor({timeout:60000});
 const close=page.getByRole('button',{name:'Close',exact:true});if(await close.count())await close.click();
 const sizes=[];
 for(const [width,height]of [[375,812],[768,1024],[1280,900]]){
  await page.setViewportSize({width,height});const button=page.getByRole('button',{name:'Start recording',exact:true});const box=await button.boundingBox();assert(box.width>=44&&box.height>=44);const controls=await Promise.all([page.getByRole('button',{name:'Start recording',exact:true}),page.getByRole('textbox',{name:'Message',exact:true}),page.getByRole('button',{name:'Send message',exact:true})].map(el=>el.boundingBox()));
  for(const rect of controls){assert(rect.x>=0&&rect.x+rect.width<=width+1);}
  const layout=await page.evaluate(()=>({pageScrollWidth:document.documentElement.scrollWidth,viewport:innerWidth}));
  const style=await button.evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));
  const rgb=v=>v.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});
  const lum=v=>{const [r,g,b]=rgb(v);return .2126*r+.7152*g+.0722*b;};const l1=lum(style.background),l2=lum(style.color);const contrast=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);assert(contrast>=4.5);
  sizes.push({width,height,button:box,controls,layout,contrast});await page.screenshot({path:'output/playwright/manual-recording/idle-'+width+'.png'});
 }
 await page.getByRole('button',{name:'Start recording',exact:true}).focus();await page.keyboard.press('Enter');
 await page.getByRole('button',{name:'Stop recording',exact:true}).waitFor();
 const started=Date.now();
 await page.waitForTimeout(11500);assert.equal(requests.length,0);assert.equal(await page.getByRole('button',{name:'Stop recording',exact:true}).isEnabled(),true);
 assert.match(await page.getByRole('status').innerText(),/pauses are kept/);
 await page.screenshot({path:'output/playwright/manual-recording/recording-after-long-pause.png'});
 await page.waitForTimeout(Math.max(0,14800-(Date.now()-started)));
 await page.getByRole('button',{name:'Stop recording',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('input[aria-label="Message"]')?.value.includes('final spoken words'),null,{timeout:30000});
 assert.equal(requests.length,1);const result=requests[0];assert.equal(result.sampleRate,16000);assert.equal(result.channels,1);assert.equal(result.bits,16);assert(result.duration>14);assert(result.firstActive<3);assert(result.lastActive>11.5);assert(result.midPauseRms<.01);assert(result.lastActive-result.firstActive>10);
 assert.equal(await page.getByRole('button',{name:'Start recording',exact:true}).isEnabled(),true);
 assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).inputValue(),'First sentence before the pause. These are my final spoken words.');
 await page.screenshot({path:'output/playwright/manual-recording/transcribed-on-stop.png'});
 // A second short recording proves capture can be restarted after completion.
 await page.getByRole('button',{name:'Start recording',exact:true}).click();await page.getByRole('button',{name:'Stop recording',exact:true}).waitFor();await page.waitForTimeout(1700);assert.equal(requests.length,1);await page.getByRole('button',{name:'Stop recording',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('button[aria-label="Start recording"]')?.disabled,null,{timeout:30000});assert.equal(requests.length,2);
 const report={requests,responsive:sizes,pageErrors:errors,limitations:['STT endpoint response is mocked; uploaded real MediaRecorder audio is decoded and checked for both speech regions and the preserved 10-second pause.','Existing global viewer/canvas layout retains desktop scroll width after resize; only recording controls are claimed to fit.','Next.js development badge can overlap the footer at narrow widths; it is outside this recording change.'],checks:['No STT before explicit Stop despite 10-second silence','One full 16 kHz mono WAV includes final words after long pause','Final dataavailable flushed and decoding completed','Keyboard Start and pointer Stop','Autosend=false leaves transcript editable','Repeat capture succeeds','375/768/1280 widths: >=44px mic target, >=4.5:1 text contrast, recording controls inside viewport']};
 fs.writeFileSync('output/playwright/manual-recording/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
