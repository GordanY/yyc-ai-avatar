import {test,expect} from '@playwright/test';

async function slide(page,n){await page.goto('/event/#slide-'+n);await expect(page.locator('#slide-count')).toHaveText(String(n).padStart(2,'0')+' / 14');}

test('event directory route, overview, keyboard and skip link preserve navigation',async({page,request})=>{
 expect((await request.get('/event/')).status()).toBe(200);
 expect((await request.get('/event')).status()).toBe(200);
 await slide(page,14);await expect(page.locator('.slide:visible')).toHaveCount(1);
 await page.locator('.skip').focus();await page.locator('.skip').press('Enter');
 await expect(page.locator('#title-14')).toBeFocused();await expect(page).toHaveURL(/#slide-14$/);
 await page.keyboard.press('Home');await expect(page.locator('#slide-1')).toBeVisible();
 await page.keyboard.press('ArrowRight');await expect(page.locator('#slide-2')).toBeVisible();
 await page.locator('#overview-open').click();await expect(page.locator('.overview-item')).toHaveCount(14);
 await expect(page.locator('.overview-item[aria-current="page"]')).toHaveText(/02/);
 await page.locator('.overview-item').nth(11).click();await expect(page.locator('#title-12')).toBeFocused();
 await page.locator('#overview-open').click();await page.keyboard.press('Escape');await expect(page.locator('#overview')).toBeHidden();
});

for(const width of [1280,390])test('reading mode tracks and retains the visible slide at '+width+'px',async({page})=>{
 await page.setViewportSize({width,height:844});await slide(page,10);await page.locator('#mode').click();
 await page.locator('#title-12').scrollIntoViewIfNeeded();
 await expect(page.locator('#slide-count')).toHaveText('12 / 14');
 await page.locator('#mode').click();await expect(page.locator('.slide:visible')).toHaveAttribute('id','slide-12');
 await expect(page.locator('#slide-count')).toHaveText('12 / 14');await expect(page).toHaveURL(/#slide-12$/);
 // At a chapter boundary the larger visible chapter wins over a previous sliver.
 await page.locator('#mode').click();
 await page.evaluate(()=>{const header=document.querySelector('.topbar').getBoundingClientRect().bottom,footer=document.querySelector('.bottom').getBoundingClientRect().top;window.scrollTo({top:document.querySelector('#slide-13').getBoundingClientRect().top+scrollY-header-(footer-header)*.35,behavior:'instant'});});
 await expect(page.locator('#slide-count')).toHaveText('13 / 14');
 const mode=await page.locator('#mode').boundingBox();await page.mouse.click(mode.x+mode.width/2,mode.y+mode.height/2);
 await expect(page.locator('.slide:visible')).toHaveAttribute('id','slide-13');await expect(page.locator('#slide-count')).toHaveText('13 / 14');
});

test('mission, knowledge, personality, quiz and checklist activities update their result',async({page})=>{
 await slide(page,2);await page.locator('[data-mission]').nth(2).click();await expect(page.locator('#mission-detail')).toContainText('更新數字人');
 await slide(page,3);await page.locator('[data-component]').nth(1).click();await expect(page.locator('#component-detail')).toContainText('不等於重新訓練');
 await slide(page,4);await page.locator('[data-personality="precise"]').click();await page.locator('[data-personality="brave"]').click();
 await expect(page.locator('#avatar-glasses')).toBeVisible();await expect(page.locator('#avatar-cape')).toBeVisible();await expect(page.locator('#personality-combination')).toContainText('3 種');
 await page.locator('#personality-reset').click();await expect(page.locator('#personality-combination')).toContainText('還沒');
 await slide(page,9);await page.locator('[data-fact="0"] [data-class="persona"]').click();await expect(page.locator('[data-fact="0"] .feedback')).toContainText('再想想');
 await page.locator('[data-fact="0"] [data-class="fact"]').click();await page.locator('[data-fact="1"] [data-class="persona"]').click();await expect(page.locator('.feedback.wrong')).toHaveCount(0);
 await slide(page,13);for(const box of await page.locator('[data-check]').all())await box.check();await expect(page.locator('#check-progress')).toContainText('已完成 3 / 3');
});

test('token prediction retains keyboard focus while busy and cancels pending examples',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});await slide(page,6);
 await page.locator('#predict-token').click();await expect(page.locator('#predict-token')).toHaveAttribute('aria-busy','true');
 await page.keyboard.press('Space');await expect(page.locator('#slide-count')).toHaveText('06 / 14');
 await expect(page.locator('#token-status')).toContainText('1 / 3');
 for(let i=2;i<=3;i++){await page.locator('#predict-token').click();await expect(page.locator('#token-status')).toContainText(i+' / 3');}
 await expect(page.locator('#new-tokens')).toBeFocused();
 await page.locator('#new-tokens').click();await page.locator('#predict-token').click();await page.locator('[data-language="zh"]').click();
 await expect(page.locator('#token-status')).toContainText('0 /');await expect(page.locator('#predict-token')).toHaveAttribute('aria-busy','false');
 await expect(page.locator('#token-caveat')).toContainText('tokenizer');
});

test('context controls synchronize capacity and disclose the scripted failure',async({page})=>{
 await slide(page,7);await page.locator('#history-range').fill('10');
 await expect(page.locator('#budget-used')).toHaveText('4,600');await expect(page.locator('#budget-feedback')).toContainText('超出');await expect(page.locator('#drift-rounds')).toHaveValue('10');
 await expect(page.locator('#drift-chat .off-topic')).toHaveCount(4);await expect(page.locator('#drift-caveat')).toContainText('對話變長不代表必定跑題');
 await page.setViewportSize({width:390,height:844});await page.locator('#drift-rounds').fill('0');await expect(page.locator('#history-range')).toHaveValue('0');await expect(page.locator('#budget-used')).toHaveText('1,600');
});

test('research copy preserves strict summary rules and offers selection if clipboard fails',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedPrompt=text;}}}));
 await slide(page,10);await page.locator('#copy-research').click();
 const copied=await page.evaluate(()=>window.copiedPrompt);expect(copied).toContain('少於 200 字或超過 300 字都不合格');expect(copied).toContain('正文只能有一個段落');expect(copied).toContain('不計標點');
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('Unavailable');}}}));
 await page.locator('#copy-research').click();await expect(page.locator('#research-copy-status')).toContainText('已選取文字');expect(await page.evaluate(()=>getSelection().toString())).toBe(copied);
});

test('workshop copy preserves chosen tone, identity and honest boundaries in both grounding modes',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedPrompt=text;}}}));
 await slide(page,11);await page.locator('#copy-prompt').click();const formal=await page.evaluate(()=>window.copiedPrompt);expect(formal).toContain('正式有禮');expect(formal).toContain('1103–1142');
 await page.locator('#prompt-tone').selectOption('warm');await page.locator('#copy-prompt').click();const warm=await page.evaluate(()=>window.copiedPrompt);expect(warm).toContain('溫和鼓勵');expect(warm).not.toBe(formal);
 await page.locator('#prompt-grounded').uncheck();await page.locator('#copy-prompt').click();const ungrounded=await page.evaluate(()=>window.copiedPrompt);expect(ungrounded).toContain('岳飛');expect(ungrounded).toContain('溫和鼓勵');expect(ungrounded).toContain('本次未加入已整理的歷史資料');expect(ungrounded).not.toContain('以上背景');expect(ungrounded).not.toContain('1103');
});

test('all fourteen slides fit a mobile page with safe links, loaded images and no model requests',async({page})=>{
 const errors=[],api=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/openrouter\.ai/.test(r.url()))api.push(r.url());});
 await page.setViewportSize({width:390,height:844});await slide(page,1);
 for(let n=1;n<=14;n++){
  await page.goto('/event/#slide-'+n);await expect(page.locator('#slide-'+n)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 expect(errors).toEqual([]);expect(api).toEqual([]);
 const unsafe=await page.locator('a[target="_blank"]').evaluateAll(links=>links.filter(a=>!a.rel.includes('noopener')).map(a=>a.href));expect(unsafe).toEqual([]);
 await slide(page,12);await expect(page.locator('.studio-shot')).toBeVisible();expect(await page.locator('.studio-shot').evaluate(i=>i.complete&&i.naturalWidth>0)).toBe(true);
 await page.locator('[data-step="2"]').click();await expect(page.locator('#walk-info')).toContainText('本簡報頁頂');
 for(const id of ['prev','next','overview-open']){expect((await page.locator('#'+id).boundingBox()).height).toBeGreaterThanOrEqual(44);}
 await slide(page,10);const copy=await page.locator('#copy-research').boundingBox(),prompt=await page.locator('#research-prompt').boundingBox();expect(copy.y+copy.height).toBeLessThan(prompt.y);
});
