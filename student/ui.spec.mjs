import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{
 await page.route('https://openrouter.ai/api/v1/models',r=>r.fulfill({json:{data:[{id:'tencent/hy4-flash',context_length:1048576}]}}));
 await page.goto('/');
 await expect(page.locator('#welcomeDialog')).toBeVisible();
 await expect(page.locator('#welcomeDialog')).toContainText('設定角色');
 await expect(page.locator('#welcomeDialog')).toContainText('加入知識');
 await expect(page.locator('#welcomeDialog')).toContainText('對話與比較');
 await page.getByRole('button',{name:'開始製作',exact:true}).click();
});
test('customization clears context, preserves quota, supports radio and multiple checks',async({page})=>{
 await page.locator('#message').fill('請介紹你自己。');await page.locator('#send').click();
 await expect(page.locator('.bubble.assistant')).toContainText('示範回應');
 await expect(page.locator('#quotaLabel')).toHaveText('本次提問 1 / 50');
 await page.locator('#agentName').fill('子曰');
 await expect(page.locator('.bubble')).toHaveCount(0);
 await expect(page.locator('#characterName')).toHaveText('子曰');
 await expect(page.locator('#quotaLabel')).toHaveText('本次提問 1 / 50');
 await page.getByLabel('幽默',{exact:true}).check();await page.getByLabel('好奇',{exact:true}).check();
 await expect(page.getByLabel('幽默',{exact:true})).toBeChecked();await expect(page.getByLabel('好奇',{exact:true})).toBeChecked();
 await page.getByLabel('正式有禮',{exact:true}).check();await expect(page.locator('input[name="tone"]:checked')).toHaveCount(1);
 await page.reload();await page.getByRole('button',{name:'開始製作',exact:true}).click();await expect(page.locator('#quotaLabel')).toHaveText('本次提問 1 / 50');await expect(page.locator('#agentName')).toHaveValue('子曰');
});
test('50 input limit survives reload and clearing; 201 words cannot submit',async({page})=>{
 await page.locator('#message').fill('word '.repeat(201));await expect(page.locator('#send')).toBeDisabled();
 await page.locator('#message').fill('學'.repeat(201));await expect(page.locator('#send')).toBeDisabled();
 await page.evaluate(()=>sessionStorage.setItem('yyc.student.quota.v1','49'));await page.reload();await page.getByRole('button',{name:'開始製作',exact:true}).click();
 await page.locator('#message').fill('你好');await page.locator('#send').click();
 await expect(page.locator('.bubble.assistant')).toContainText('示範模式');
 await expect(page.locator('#quotaLabel')).toHaveText('本次提問 50 / 50');
 await page.locator('#clearChat').click();await page.locator('#description').fill('新設定');
 await page.locator('#message').fill('again');await expect(page.locator('#send')).toBeDisabled();
 await page.reload();await page.getByRole('button',{name:'開始製作',exact:true}).click();await expect(page.locator('#quotaLabel')).toHaveText('本次提問 50 / 50');
});
test('direct OpenRouter request uses profile, no audio, actual usage and memory-only key',async({page})=>{
 let payload,authorization;
 await page.route('https://openrouter.ai/api/v1/chat/completions',async r=>{
   payload=r.request().postDataJSON();authorization=r.request().headers().authorization;
   await r.fulfill({json:{choices:[{message:{content:'你好，今天想探討甚麼？'}}],usage:{total_tokens:1024}}});
 });
 await page.locator('#connection').click();await page.locator('#apiKey').fill('sk-or-v1-test-only');await page.getByRole('button',{name:'連接',exact:true}).click();
 await page.locator('#message').fill('你好');await page.locator('#send').click();
 await expect(page.locator('.bubble.assistant')).toContainText('今天想探討甚麼');
 expect(payload.model).toBe('tencent/hy4-flash');expect(payload).not.toHaveProperty('reasoning');expect(payload).not.toHaveProperty('reasoning_effort');expect(authorization).toBe('Bearer sk-or-v1-test-only');expect(payload.messages[0].content).toContain('知微');
 expect(payload.messages.at(-1)).toEqual({role:'user',content:'你好'});expect(payload).not.toHaveProperty('audio');
 await expect(page.locator('#contextValue')).toContainText('1,024 tokens');await expect(page.locator('#tokenLabel')).toHaveText('上次實際');
 const saved=await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));expect(saved).not.toContain('sk-or');
 await page.reload();await page.getByRole('button',{name:'開始製作',exact:true}).click();await expect(page.locator('#connection')).toContainText('開始製作你的數字人');
});
test('provider failure is readable and does not lock the composer',async({page})=>{
 await page.route('https://openrouter.ai/api/v1/chat/completions',r=>r.fulfill({status:401,json:{error:{message:'provider internal detail'}}}));
 await page.locator('#connection').click();await page.locator('#apiKey').fill('sk-or-v1-test-only');await page.getByRole('button',{name:'連接',exact:true}).click();
 await page.locator('#message').fill('test');await page.locator('#send').click();
 await expect(page.locator('#notice')).toContainText('API key 無效');await expect(page.locator('#send')).toBeEnabled();
 await expect(page.locator('#quotaLabel')).toHaveText('本次提問 1 / 50');
});
test('late replies are discarded when the profile changes',async({page})=>{
 await page.route('https://openrouter.ai/api/v1/chat/completions',async r=>{await new Promise(resolve=>setTimeout(resolve,800));try{await r.fulfill({json:{choices:[{message:{content:'STALE'}}]}});}catch{}});
 await page.locator('#connection').click();await page.locator('#apiKey').fill('sk-or-v1-test-only');await page.getByRole('button',{name:'連接',exact:true}).click();
 await page.locator('#message').fill('test');await page.locator('#send').click();await page.locator('#agentName').fill('新角色');
 await page.waitForTimeout(1000);await expect(page.locator('.bubble')).toHaveCount(0);await expect(page.locator('#quotaLabel')).toHaveText('本次提問 1 / 50');
});
test('school VRM renders and responsive layouts do not overflow',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await expect(page).toHaveTitle('數字人製作');
 await expect(page.locator('.brand')).toContainText('數字人製作');
 await expect(page.locator('#connection')).toContainText('開始製作你的數字人');
 for(const width of [1440,1600]){
  await page.setViewportSize({width,height:1000});
  const positions=await page.locator('.panel .section-label').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));
  expect(Math.max(...positions)-Math.min(...positions)).toBeLessThanOrEqual(1);
 }
 await page.setViewportSize({width:1440,height:1000});
 expect(await page.locator('#message').evaluate(n=>parseFloat(getComputedStyle(n).fontSize))).toBeGreaterThanOrEqual(16);
 await expect(page.locator('#avatarStatus')).toHaveText('',{timeout:60000});
 await expect(page.locator('#avatarMount canvas')).toBeVisible();
 await page.screenshot({path:'test-results/student-desktop.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/student-mobile.png',fullPage:true});
 expect(errors).toEqual([]);
 await page.locator('[data-avatar="scholar"]').click();await expect(page.locator('#avatarMount iframe')).toHaveAttribute('src',/sketchfab/);
 await expect(page.locator('#avatarStatus')).toContainText('尚未下載');
});
