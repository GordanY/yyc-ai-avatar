const { chromium } = require('/Users/gordanyeung/.npm/_npx/84539a01c0e4c364/node_modules/playwright');
const { WaveFile } = require('wavefile');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${__dirname}/manual-mic-fixture.wav`]});
 try {
 const context = await browser.newContext({permissions:['microphone'],viewport:{width:1280,height:900}});
 const page = await context.newPage(); const uploads=[];
 await page.addInitScript(() => {
  for(const [k,v] of Object.entries({show_introduction:'false',stt_backend:'whispercpp',whispercpp_url:'http://localhost:3000/empty-stt',autosend_from_mic:'false',chatbot_backend:'echo',tts_backend:'none',amica_life_enabled:'false'})) localStorage.setItem('chatvrm_'+k,v);
  // Reproduce a browser encoder returning zero bytes while microphone PCM is available.
  const NativeRecorder = MediaRecorder;
  window.MediaRecorder = class extends NativeRecorder {
   set ondataavailable(callback) { super.ondataavailable = callback ? event => callback(new BlobEvent('dataavailable',{data:new Blob([],{type:event.data.type})})) : null; }
   get ondataavailable() { return super.ondataavailable; }
  };
 });
 await page.route('**/api/dataHandler?type=config',r=>r.request().method()==='POST'?r.fulfill({status:200,contentType:'application/json',body:'{}'}):r.continue());
 await page.route('**/empty-stt/inference',async r => {
  const body=r.request().postDataBuffer(); const pos=body.indexOf(Buffer.from('RIFF')); assert(pos>=0);
  const wav=new WaveFile(body.subarray(pos,pos+8+body.readUInt32LE(pos+4))); const values=wav.getSamples(true,Float32Array);
  let energy=0;for(const value of values)energy+=value*value;
  const bins=[];for(let p=0;p<values.length;p+=1600){let sum=0;for(let i=p;i<Math.min(values.length,p+1600);i++)sum+=values[i]*values[i];bins.push(Math.sqrt(sum/Math.min(1600,values.length-p))/32768);}
  const active=bins.map((value,i)=>value>.008?i/10:-1).filter(value=>value>=0);
  uploads.push({duration:values.length/wav.fmt.sampleRate,sampleRate:wav.fmt.sampleRate,channels:wav.fmt.numChannels,rms:Math.sqrt(energy/values.length),firstActive:active[0],lastActive:active.at(-1),midPauseRms:bins.slice(45,105).reduce((a,b)=>a+b,0)/60});
  await r.fulfill({json:{text:'Recovered the complete recording.'}});
 });
 await page.goto('http://localhost:3000');
 await page.getByRole('button',{name:'Start recording',exact:true}).waitFor({timeout:60000});
 const close=page.getByRole('button',{name:'Close',exact:true}); if(await close.count())await close.click();
 await page.getByRole('button',{name:'Start recording',exact:true}).click();
 await page.getByRole('button',{name:'Stop recording',exact:true}).waitFor();
 await page.waitForTimeout(14800); assert.equal(uploads.length,0);
 await page.getByRole('button',{name:'Stop recording',exact:true}).click();
 await page.waitForFunction(() => document.querySelector('input[aria-label="Message"]')?.value || document.querySelector('[role="alert"]'),null,{timeout:15000});
 const symptom=await page.locator('[role="alert"]').allTextContents();
 assert.equal(uploads.length,1,`Expected recovered audio upload; alerts: ${symptom.join(' ')}`);
 assert(uploads[0].duration>=14); assert(uploads[0].firstActive<3); assert(uploads[0].lastActive>11.5); assert(uploads[0].midPauseRms<.01); assert.equal(uploads[0].sampleRate,16000); assert.equal(uploads[0].channels,1); assert(uploads[0].rms>1);
 assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).inputValue(),'Recovered the complete recording.');
 await page.screenshot({path:'output/playwright/manual-recording/empty-encoder-recovered.png'});
 fs.writeFileSync('output/playwright/manual-recording/empty-encoder-report.json',JSON.stringify({uploads,checks:['Zero-byte encoded audio recovers real microphone PCM','No transcription before Stop despite a 10-second pause','Both speech regions and the complete pause survive PCM recovery','Full 16 kHz mono recording uploaded'],limitations:['Browser encoder failure is injected; microphone is a real browser capture of a WAV fixture; STT response is mocked.']},null,2));
 console.log(JSON.stringify({uploads}));
 } finally { await browser.close(); }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
