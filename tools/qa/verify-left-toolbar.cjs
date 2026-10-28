const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require('/Users/gordanyeung/.npm/_npx/84539a01c0e4c364/node_modules/playwright');
(async()=>{
 const dir='output/playwright/left-toolbar';fs.mkdirSync(dir,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{for(const[k,v]of Object.entries({vrm_url:'/vrm/YYC_InfoDay.vrm',vrm_save_type:'web',animation_url:'/animations/yyc/YYC_idle.vrma',animation_procedural:'false',show_introduction:'false',stt_backend:'whispercpp',chatbot_backend:'echo',tts_backend:'none',amica_life_enabled:'false',random_gestures_enabled:'false'}))localStorage.setItem('chatvrm_'+k,v)});
 await page.route(u=>u.pathname.replace(/\/$/,'')==='/api/dataHandler'&&u.searchParams.get('type')==='config',r=>r.request().method()==='POST'?r.fulfill({status:200,contentType:'application/json',body:'{}'}):r.continue());
 await page.goto('http://localhost:3000');
 await page.waitForFunction(()=>{const c=document.querySelector('canvas');if(!c)return false;let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber'))];while(f){for(let d=f.dependencies?.firstContext;d;d=d.next)if(d.memoizedValue?.viewer?.model?.gestures){window.toolbarModel=d.memoizedValue.viewer.model;return true;}f=f.return;}return false;},null,{timeout:60000});
 const settings=page.getByRole('button',{name:'Settings',exact:true}),nav=page.getByRole('navigation',{name:'Avatar tools'}),gesture=page.getByRole('button',{name:'Gestures / 動作',exact:true});
 await settings.waitFor({timeout:60000});
 const close=page.getByRole('button',{name:'Close',exact:true});if(await close.count())await close.click();
 assert.equal(await settings.getAttribute('aria-expanded'),'false');assert.equal(await nav.count(),0);assert.equal(await gesture.count(),0);
 const settingsBox=await settings.boundingBox();assert(settingsBox.x<20&&settingsBox.y<20&&settingsBox.height>=44);await page.screenshot({path:dir+'/collapsed.png'});
 await settings.focus();await page.keyboard.press('Enter');await nav.waitFor();assert.equal(await settings.getAttribute('aria-expanded'),'true');
 const gestureBox=await gesture.boundingBox(),navBox=await nav.boundingBox();assert(gestureBox.x>=navBox.x&&gestureBox.x+gestureBox.width<=navBox.x+navBox.width);assert(gestureBox.x<100&&gestureBox.y>settingsBox.y+settingsBox.height);assert.equal(await gesture.count(),1);assert(gestureBox.width>=44&&gestureBox.height>=44);await page.screenshot({path:dir+'/expanded.png'});
 await gesture.click();await page.screenshot({path:dir+'/gesture-open.png'});await page.getByRole('heading',{name:'Gestures / 動作',exact:true}).waitFor();const preview=page.getByRole('button',{name:'Preview Nod / 點頭',exact:true});await preview.waitFor({timeout:15000});
 // Verify that the relocated control still reaches the actual avatar scheduler.

 await preview.click();await page.waitForFunction(()=>toolbarModel.gestures.frame?.action.id==='nod');await page.screenshot({path:dir+'/gesture-dialog.png'});
 await page.keyboard.press('Escape');await page.getByRole('heading',{name:'Gestures / 動作',exact:true}).waitFor({state:'hidden'});assert.equal(await settings.getAttribute('aria-expanded'),'true');await gesture.focus();await page.keyboard.press('Escape');await nav.waitFor({state:'hidden'});assert(await settings.evaluate(el=>document.activeElement===el));
 // App settings remains reachable from the expanded toolbar.
 await settings.click();await page.getByRole('button',{name:'App settings',exact:true}).click();await page.getByRole('navigation',{name:'Breadcrumb',exact:true}).waitFor();
 // Close app settings through the existing main-menu Home control.
 await page.getByRole('navigation',{name:'Breadcrumb',exact:true}).getByText('Home',{exact:true}).locator('..').click();await page.getByRole('navigation',{name:'Breadcrumb',exact:true}).waitFor({state:'hidden'});
 assert.equal(await settings.getAttribute('aria-expanded'),'false');
 const layouts=[];
 for(const size of [{width:375,height:667},{width:768,height:1024},{width:1280,height:900}]){
  await page.setViewportSize(size);await settings.click();const box=await nav.boundingBox();assert(box.x>=0&&box.x+box.width<=size.width);assert(box.y+box.height<=size.height-80);await page.getByRole('button',{name:'Show camera preview',exact:true}).scrollIntoViewIfNeeded();assert(await page.getByRole('button',{name:'Show camera preview',exact:true}).isVisible());layouts.push({...size,nav:box,scrollable:await nav.evaluate(el=>el.scrollHeight>el.clientHeight)});await nav.evaluate(el=>el.scrollTop=0);await page.screenshot({path:dir+'/expanded-'+size.width+'.png'});await settings.click();assert.equal(await gesture.count(),0);assert(await settings.isVisible());await page.screenshot({path:dir+'/collapsed-'+size.width+'.png'});
 }
 assert.equal(errors.length,0,errors.join('; '));const result={settings:settingsBox,gesture:gestureBox,layouts,errors,checks:['Settings stays at top-left while toolbar is collapsed','Keyboard and pointer expand/collapse','Gestures trigger exists once inside left toolbar','Gesture preview runs the actual nod scheduler','Escape closes gestures first, then collapses toolbar and restores focus','App settings remains reachable','Short-screen toolbar scrolls without covering composer','375/768/1280 layouts checked']};fs.writeFileSync(dir+'/report.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close()}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
