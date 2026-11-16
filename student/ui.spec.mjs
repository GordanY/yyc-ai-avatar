import {test,expect} from '@playwright/test';
async function connectKey(page){
 await page.locator('#apiKey').fill('sk-or-v1-browser-test');await page.getByRole('button',{name:'連接',exact:true}).click();
 await expect(page.locator('#connectionStatus')).toContainText('已驗證');
}
async function loginAdmin(page){
 await page.locator('#enterAdminMode').click();await page.locator('#adminPassword').fill('YYC123456');
 await page.locator('#adminLoginForm [type="submit"]').click();await expect(page.locator('#adminReset')).toBeVisible();
}
async function resetAll(page){
 if(!await page.locator('#adminReset').isVisible())await loginAdmin(page);
 await page.locator('#adminReset').click();await page.locator('#adminResetForm [type="submit"]').click();
}
test.beforeEach(async({page},testInfo)=>{
 // Interaction checks do not need to reload the 78 MB avatar; the dedicated render check uses the real asset.
 if(!testInfo.title.startsWith('school VRM')) await page.route('**/assets/YYC_InfoDay.vrm',route=>route.abort());
 else await page.emulateMedia({reducedMotion:'no-preference'});
 await page.route('https://openrouter.ai/api/v1/models',r=>r.fulfill({json:{data:[{id:'tencent/hy4-flash',context_length:1048576}]}}));
 await page.route('https://openrouter.ai/api/v1/key',r=>r.fulfill({json:{data:{is_management_key:false}}}));
 await page.route('https://openrouter.ai/api/v1/chat/completions',r=>r.fulfill({json:{choices:[{message:{content:'這是測試回覆。'}}]}}));
 await page.goto('/');
 await expect(page.locator('#welcomeDialog')).toBeVisible();
 await expect(page.locator('#welcomeDialog')).toContainText('設定角色');
 await expect(page.locator('#welcomeDialog')).toContainText('加入知識');
 await expect(page.locator('#welcomeDialog')).toContainText('對話與比較');
 if(testInfo.title.startsWith('school VRM')) await page.screenshot({path:'test-results/welcome-dialog.png'});
 await page.getByRole('button',{name:'開始製作',exact:true}).click();
});
test('updating an avatar applies drafts and preserves quota when settings are hidden',async({page})=>{
 await connectKey(page);
 await page.locator('#message').fill('請介紹你自己。');await page.locator('#send').click();
 await expect(page.locator('.bubble.assistant')).toContainText('測試回覆');await expect(page.locator('#send')).toHaveText('傳送 ↑');
 await expect(page.locator('#quotaLabel')).toHaveText('本次提問 1 / 50');
 const expanded=await page.locator('.workspace').evaluate(node=>({
  total:node.getBoundingClientRect().width,
  columns:[...node.children].map(child=>child.getBoundingClientRect().width)
 }));
 expect(expanded.columns[0]/expanded.total).toBeCloseTo(.3,2);
 expect(expanded.columns[1]/expanded.total).toBeCloseTo(.4,2);
 expect(expanded.columns[2]/expanded.total).toBeCloseTo(.3,2);
 await page.locator('#description').fill('測試未儲存的草稿');
 await page.getByRole('button',{name:'隱藏設定',exact:true}).click();
 await expect(page.locator('#customizePanel')).toBeHidden();
 const collapsed=await page.locator('.workspace').evaluate(node=>({
  total:node.getBoundingClientRect().width,
  character:node.querySelector('.character').getBoundingClientRect().width,
  chat:node.querySelector('.chat').getBoundingClientRect().width
 }));
 expect(collapsed.character/collapsed.total).toBeCloseTo(.4,2);
 expect(collapsed.chat/collapsed.total).toBeCloseTo(.6,2);
 await expect(page.locator('.bubble.assistant')).toHaveCount(1);
 await expect(page.locator('#quotaLabel')).toHaveText('本次提問 1 / 50');
 await page.getByRole('button',{name:'顯示設定',exact:true}).click();
 await expect(page.locator('#description')).toHaveValue('測試未儲存的草稿');
 await expect(page.locator('.panel .section-label')).toHaveText(['設定角色','認識角色','開始對話']);
 await page.locator('#agentName').fill('子曰');
 await expect(page.locator('.bubble.assistant')).toHaveCount(1);
 await expect(page.locator('#characterName')).toHaveText('知微');
 await page.locator('#saveSettings').click();
 await expect(page.locator('.bubble')).toHaveCount(0);
 await expect(page.locator('#characterName')).toHaveText('子曰');
 await expect(page.locator('#quotaLabel')).toHaveText('本次提問 1 / 50');
 await page.getByLabel('幽默',{exact:true}).check();await page.getByLabel('好奇',{exact:true}).check();
 await expect(page.getByLabel('幽默',{exact:true})).toBeChecked();await expect(page.getByLabel('好奇',{exact:true})).toBeChecked();
 await page.getByLabel('正式有禮',{exact:true}).check();await expect(page.locator('input[name="tone"]:checked')).toHaveCount(1);await page.locator('#saveSettings').click();
 await page.reload();await page.getByRole('button',{name:'開始製作',exact:true}).click();await expect(page.locator('#quotaLabel')).toHaveText('本次提問 1 / 50');await expect(page.locator('#agentName')).toHaveValue('子曰');
 await expect(page.locator('#restoreSettings')).toHaveCount(0);
 await expect(page.locator('#saveSettings')).toHaveText('更新數字人');
});
test('chat requires a verified OpenRouter connection and offers no sample mode',async({page})=>{
 let calls=0;await page.route('https://openrouter.ai/api/v1/chat/completions',route=>{calls++;return route.fulfill({json:{choices:[{message:{content:'已連接的回覆'}}]}});});
 await expect(page.locator('#disconnect')).toHaveCount(0);await expect(page.getByText('使用示範模式',{exact:true})).toHaveCount(0);
 await page.locator('#message').fill('你好');await expect(page.locator('#send')).toBeDisabled();
 await page.evaluate(()=>document.getElementById('chatForm').requestSubmit());
 await expect(page.locator('#notice')).toContainText('請先連接 OpenRouter');await expect(page.locator('#quotaLabel')).toHaveText('本次提問 0 / 50');
 await expect(page.locator('.bubble')).toHaveCount(0);expect(calls).toBe(0);
 await connectKey(page);await expect(page.locator('#message')).toHaveValue('你好');await page.locator('#send').click();
 await expect(page.locator('.bubble.assistant')).toContainText('已連接的回覆');expect(calls).toBe(1);
});
test('Yue Fei loads only on Refresh and preserves connection and quota',async({page})=>{
 await connectKey(page);await page.locator('#message').fill('先前的問題');await page.locator('#send').click();
 await expect(page.locator('#send')).toHaveText('傳送 ↑');
 await page.locator('#profileTemplate').selectOption('yue-fei');
 await expect(page.locator('#agentName')).toHaveValue('知微');await expect(page.locator('#characterName')).toHaveText('知微');await expect(page.locator('.bubble')).toHaveCount(2);
 await page.locator('#refreshTemplate').click();
 await expect(page.locator('#agentName')).toHaveValue('岳飛');await expect(page.locator('#characterName')).toHaveText('岳飛');
 await expect(page.locator('#knowledge')).toHaveValue(/1103–1142/);await expect(page.locator('#knowledge')).toHaveValue(/字鵬舉/);
 await expect(page.locator('#knowledge')).toHaveValue(/不能把小說/);await expect(page.locator('#description')).toHaveValue(/歷史學習數字人/);
 for(const personality of ['忠誠','勇敢','嚴謹','耐心'])await expect(page.getByLabel(personality,{exact:true})).toBeChecked();
 await expect(page.getByLabel('正式有禮',{exact:true})).toBeChecked();await expect(page.locator('#templateSourceList a')).toHaveCount(3);
 await expect(page.locator('#avatarMount')).toHaveAttribute('data-model','scholar');await expect(page.locator('.bubble')).toHaveCount(0);
 await expect(page.locator('#quotaLabel')).toHaveText('本次提問 1 / 50');await expect(page.locator('#connectionStatus')).toContainText('已驗證');
 await page.locator('#description').fill('未套用修改');await page.locator('#refreshTemplate').click();await expect(page.locator('#description')).toHaveValue(/以南宋將領岳飛為藍本/);
 await page.reload();await page.getByRole('button',{name:'開始製作',exact:true}).click();
 await expect(page.locator('#agentName')).toHaveValue('岳飛');await expect(page.locator('#quotaLabel')).toHaveText('本次提問 1 / 50');
 await expect(page.locator('#templateSources')).toBeVisible();await expect(page.locator('#connectionStatus')).toContainText('未連接');
});
test('50 input limit survives reload and clearing; 201 words cannot submit',async({page})=>{
 await connectKey(page);
 await page.locator('#message').fill('word '.repeat(201));await expect(page.locator('#send')).toBeDisabled();
 await page.locator('#message').fill('學'.repeat(201));await expect(page.locator('#send')).toBeDisabled();
 await page.evaluate(()=>sessionStorage.setItem('yyc.student.quota.v1','49'));await page.reload();await page.getByRole('button',{name:'開始製作',exact:true}).click();
 await connectKey(page);
 await page.locator('#message').fill('你好');await page.locator('#send').click();
 await expect(page.locator('.bubble.assistant')).toContainText('測試回覆');await expect(page.locator('#send')).toHaveText('傳送 ↑');
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
 await page.locator('#apiKey').focus();
 await expect(page.locator('#apiKey')).toBeEditable();await expect(page.locator('#apiKey')).toBeFocused();
 await page.locator('#apiKey').fill('sk-or-v1-test-only');
 await page.getByRole('button',{name:'顯示金鑰',exact:true}).click();
 await expect(page.locator('#apiKey')).toHaveAttribute('type','text');await expect(page.locator('#apiKey')).toHaveValue('sk-or-v1-test-only');
 await page.getByRole('button',{name:'隱藏金鑰',exact:true}).click();
 await expect(page.locator('#apiKey')).toHaveAttribute('type','password');await expect(page.locator('#apiKey')).toHaveValue('sk-or-v1-test-only');
 await page.getByRole('button',{name:'連接',exact:true}).click();
 await page.locator('#message').fill('你好');await page.locator('#send').click();
 await expect(page.locator('.bubble.assistant')).toContainText('今天想探討甚麼');
 expect(payload.model).toBe('tencent/hy4-flash');expect(payload).not.toHaveProperty('reasoning');expect(payload).not.toHaveProperty('reasoning_effort');expect(authorization).toBe('Bearer sk-or-v1-test-only');expect(payload.messages[0].content).toContain('知微');
 expect(payload.messages.at(-1)).toEqual({role:'user',content:'你好'});expect(payload).not.toHaveProperty('audio');
 await expect(page.locator('#contextValue')).toContainText('1,024 tokens');await expect(page.locator('#tokenLabel')).toHaveText('上次實際');
 await page.locator('#apiKey').focus();await expect(page.locator('#apiKey')).toHaveValue('sk-or-v1-test-only');
 await expect(page.locator('#apiKey')).toHaveAttribute('type','password');
 const saved=await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));expect(saved).not.toContain('sk-or');
 await page.reload();await page.getByRole('button',{name:'開始製作',exact:true}).click();await expect(page.locator('#connectionStatus')).toContainText('未連接');await expect(page.locator('#apiKey')).toHaveValue('');
});
test('pasted Authorization header is accepted without exposing or altering the key',async({page})=>{
 let authorization;
 await page.route('https://openrouter.ai/api/v1/chat/completions',route=>{
  authorization=route.request().headers().authorization;
  return route.fulfill({json:{choices:[{message:{content:'已連接'}}]}});
 });
 await page.locator('#apiKey').fill('  Authorization: Bearer "sk-or-v1-paste-test"  ');
 await page.getByRole('button',{name:'連接',exact:true}).click();
 await expect(page.locator('#keyNotice')).not.toContainText('請輸入有效格式');
 await expect(page.locator('#connectionStatus')).toContainText('OpenRouter');
 await page.locator('#message').fill('test');await page.locator('#send').click();
 await expect(page.locator('.bubble.assistant')).toContainText('已連接');
 expect(authorization).toBe('Bearer sk-or-v1-paste-test');
});
test('OpenRouter validates keys without spending quota and explains rejected credentials',async({page})=>{
 await page.route('https://openrouter.ai/api/v1/key',route=>route.fulfill({status:401,json:{error:{message:'Invalid API key'}}}));
 await page.locator('#apiKey').fill('sk-or-invalid-test');await page.getByRole('button',{name:'連接',exact:true}).click();
 await expect(page.locator('#keyNotice')).toContainText('OpenRouter 不接受此金鑰');
 await expect(page.locator('#connectionStatus')).toContainText('未連接');
 await expect(page.locator('#quotaLabel')).toHaveText('本次提問 0 / 50');
 await expect(page.getByRole('button',{name:'連接',exact:true})).toBeEnabled();
});
test('API validation preserves a typed draft and cannot reconnect after admin reset',async({page})=>{
 let release;
 const gate=new Promise(resolve=>{release=resolve;});
 await page.route('https://openrouter.ai/api/v1/key',async route=>{
  await gate;try{await route.fulfill({json:{data:{is_management_key:false}}});}catch{}
 });
 await page.locator('#apiKey').fill('sk-or-pending-test');await page.getByRole('button',{name:'連接',exact:true}).click();
 await page.locator('#message').fill('保留我的問題');await expect(page.locator('#send')).toBeDisabled();
 await page.locator('#message').press('Enter');await expect(page.locator('.bubble')).toHaveCount(0);
 await resetAll(page);
 release();await page.waitForTimeout(300);
 await expect(page.locator('#connectionStatus')).toContainText('未連接');await expect(page.locator('#apiKey')).toHaveValue('');
 await expect(page.locator('#quotaLabel')).toHaveText('本次提問 0 / 50');
});
test('API validation failure reports network problems instead of key format',async({page})=>{
 await page.route('https://openrouter.ai/api/v1/key',route=>route.abort('internetdisconnected'));
 await page.locator('#apiKey').fill('sk-or-network-test');await page.getByRole('button',{name:'連接',exact:true}).click();
 await expect(page.locator('#keyNotice')).toContainText('檢查網絡');
 await expect(page.locator('#connectionStatus')).toContainText('未連接');
});
test('provider failure is readable and does not lock the composer',async({page})=>{
 await page.route('https://openrouter.ai/api/v1/chat/completions',r=>r.fulfill({status:401,json:{error:{message:'provider internal detail'}}}));
 await page.locator('#apiKey').focus();await page.locator('#apiKey').fill('sk-or-v1-test-only');await page.getByRole('button',{name:'連接',exact:true}).click();
 await page.locator('#message').fill('test');await page.locator('#send').click();
 await expect(page.locator('#notice')).toContainText('API 金鑰 無效');await expect(page.locator('#send')).toBeEnabled();
 await expect(page.locator('#quotaLabel')).toHaveText('本次提問 1 / 50');
});
test('late replies are discarded when the profile changes',async({page})=>{
 await page.route('https://openrouter.ai/api/v1/chat/completions',async r=>{await new Promise(resolve=>setTimeout(resolve,800));try{await r.fulfill({json:{choices:[{message:{content:'STALE'}}]}});}catch{}});
 await page.locator('#apiKey').focus();await page.locator('#apiKey').fill('sk-or-v1-test-only');await page.getByRole('button',{name:'連接',exact:true}).click();
 await page.locator('#message').fill('test');await page.locator('#send').click();await page.locator('#agentName').fill('新角色');await page.locator('#saveSettings').click();
 await page.waitForTimeout(1000);await expect(page.locator('.bubble')).toHaveCount(0);await expect(page.locator('#quotaLabel')).toHaveText('本次提問 1 / 50');
});
test('admin mode unlocks reset without changing data and reset clears the whole session',async({page})=>{
 await page.evaluate(()=>{sessionStorage.setItem('yyc.student.quota.v1','49');sessionStorage.setItem('other-app-session','keep');localStorage.setItem('other-app-profile','keep');});
 await page.reload();await page.getByRole('button',{name:'開始製作',exact:true}).click();
 await page.locator('#agentName').fill('自訂文士');await page.locator('#description').fill('已套用描述');
 await page.locator('#knowledge').fill('測試知識');await page.getByLabel('正式有禮',{exact:true}).check();
 await page.getByLabel('幽默',{exact:true}).check();await page.locator('#saveSettings').click();
 await page.locator('[data-avatar="scholar"]').click();await connectKey(page);
 await page.locator('#message').fill('測試問題');await page.locator('#send').click();await expect(page.locator('#send')).toHaveText('傳送 ↑');
 await expect(page.locator('#quotaLabel')).toHaveText('本次提問 50 / 50');
 await page.locator('#description').fill('尚未套用的草稿');await page.getByRole('button',{name:'隱藏設定',exact:true}).click();
 await expect(page.locator('#adminReset')).toBeHidden();
 await page.evaluate(()=>document.getElementById('adminResetForm').requestSubmit());
 await expect(page.locator('#quotaLabel')).toHaveText('本次提問 50 / 50');
 await page.locator('#enterAdminMode').click();await page.locator('#adminPassword').fill('wrong');
 await page.locator('#adminLoginForm [type="submit"]').click();await expect(page.locator('#adminLoginNotice')).toContainText('密碼不正確');
 await expect(page.locator('#adminReset')).toBeHidden();await page.locator('#cancelAdminLogin').click();
 await expect(page.locator('#adminPassword')).toHaveValue('');
 await loginAdmin(page);await expect(page.locator('#enterAdminMode')).toBeHidden();
 await expect(page.locator('.bubble')).toHaveCount(2);await expect(page.locator('#characterName')).toHaveText('自訂文士');
 await expect(page.locator('#quotaLabel')).toHaveText('本次提問 50 / 50');
 await page.locator('#adminReset').click();await page.locator('#cancelAdminReset').click();
 await page.getByRole('button',{name:'顯示設定',exact:true}).click();await expect(page.locator('#description')).toHaveValue('尚未套用的草稿');
 await resetAll(page);
 await expect(page.locator('#adminResetDialog')).toBeHidden();await expect(page.locator('#adminReset')).toBeVisible();
 await expect(page.locator('#customizePanel')).toBeVisible();await expect(page.locator('#agentName')).toHaveValue('知微');
 await expect(page.locator('#description')).toHaveValue('一位喜歡以問題引導思考的學習伙伴。');
 await expect(page.getByLabel('溫和鼓勵',{exact:true})).toBeChecked();await expect(page.getByLabel('幽默',{exact:true})).not.toBeChecked();
 await expect(page.locator('#knowledge')).toHaveValue('請以繁體中文協助中學生學習。遇到不知道的事情，坦白說明，並鼓勵學生查證。');
 await expect(page.locator('#settingsStatus')).not.toHaveClass(/unsaved/);await expect(page.locator('.character')).toHaveAttribute('data-avatar','school');
 await expect(page.locator('#quotaLabel')).toHaveText('本次提問 0 / 50');await expect(page.locator('.bubble')).toHaveCount(0);
 await expect(page.locator('#apiKey')).toHaveValue('');await expect(page.locator('#connectionStatus')).toContainText('未連接');
 await expect(page.locator('#tokenLabel')).toHaveText('估算');await expect(page.locator('#templateSources')).toBeHidden();
 expect(await page.evaluate(()=>({profile:localStorage.getItem('yyc.student.profile.v1'),quota:sessionStorage.getItem('yyc.student.quota.v1'),otherProfile:localStorage.getItem('other-app-profile'),otherSession:sessionStorage.getItem('other-app-session')}))).toEqual({profile:null,quota:'0',otherProfile:'keep',otherSession:'keep'});
 await page.locator('#message').fill('重新開始');await expect(page.locator('#send')).toBeDisabled();
 await page.locator('#exitAdminMode').click();await expect(page.locator('#adminReset')).toBeHidden();await expect(page.locator('#enterAdminMode')).toBeVisible();
 await page.reload();await page.getByRole('button',{name:'開始製作',exact:true}).click();
 await expect(page.locator('#quotaLabel')).toHaveText('本次提問 0 / 50');await expect(page.locator('#agentName')).toHaveValue('知微');await expect(page.locator('#adminReset')).toBeHidden();
});
for(const phase of ['fetch','typewriter'])test('admin reset cancels a pending '+phase+' reply',async({page})=>{
 let release;
 const gate=new Promise(resolve=>{release=resolve;});
 await page.route('https://openrouter.ai/api/v1/chat/completions',async route=>{
  if(phase==='fetch')await gate;
  try{await route.fulfill({json:{choices:[{message:{content:'STALE '.repeat(120)}}]}});}catch{}
 });
 await page.locator('#apiKey').fill('sk-or-reset-race');await page.getByRole('button',{name:'連接',exact:true}).click();
 await page.locator('#message').fill('測試');await page.locator('#send').click();
 if(phase==='typewriter')await expect(page.locator('.bubble.assistant')).toContainText('STALE');
 await resetAll(page);
 release();await page.waitForTimeout(900);
 await expect(page.locator('.bubble')).toHaveCount(0);await expect(page.locator('#quotaLabel')).toHaveText('本次提問 0 / 50');
 await page.locator('#message').fill('新問題');await expect(page.locator('#send')).toBeDisabled();
 await connectKey(page);await expect(page.locator('#send')).toBeEnabled();
});
test('scholar animations and both local backdrops load without an external embed',async({page})=>{
 const failed=[],isAsset=url=>/assets\/(backgrounds|scholar)/.test(url);
 page.on('requestfailed',request=>{
  // Changing a gesture/appearance intentionally cancels an image still loading.
  if(isAsset(request.url())&&request.failure()?.errorText!=='net::ERR_ABORTED')failed.push(request.url());
 });
 page.on('response',response=>{if(isAsset(response.url())&&!response.ok())failed.push(response.status()+' '+response.url());});
 const background=()=>page.locator('.stage').evaluate(node=>getComputedStyle(node).backgroundImage);
 expect(await background()).toContain('classroom.webp');
 await page.locator('[data-avatar="scholar"]').click();
 await expect(page.locator('#avatarMount iframe')).toHaveCount(0);
 await expect(page.locator('#avatarMount canvas')).toBeVisible();
 await expect(page.locator('#avatarStatus')).toHaveText('');
 await expect(page.locator('#avatarMount')).toHaveAttribute('data-model','scholar');
 await expect(page.locator('#avatarMount')).toHaveAttribute('data-action','idle');
 await expect(page.locator('#movementSelect option')).toHaveText(['選擇動作','1. 自然站立','2. 點頭','3. 揮手','5. 打招呼（揮手）','13. 解說','14. 強調']);
 await page.locator('#movementSelect').selectOption('explain');
 await expect(page.locator('#avatarMount')).toHaveAttribute('data-preview','explain');
 await expect(page.locator('#avatarMount')).toHaveAttribute('data-action','explain');
 await expect(page.locator('#avatarMount')).not.toHaveAttribute('data-preview',/./,{timeout:8000});
 await expect(page.locator('#avatarMount')).toHaveAttribute('data-action','idle');
 await page.locator('#replayMovement').click();await expect(page.locator('#avatarMount')).toHaveAttribute('data-preview','explain');
 await page.locator('#clearChat').click();await expect(page.locator('#avatarMount')).not.toHaveAttribute('data-preview',/./);
 const canvas=page.locator('#avatarMount canvas'),bounds=await canvas.boundingBox();
 const initialCamera=await page.locator('#avatarMount').getAttribute('data-camera');
 await page.mouse.move(bounds.x+bounds.width*.5,bounds.y+bounds.height*.5);await page.mouse.down();
 await page.mouse.move(bounds.x+bounds.width*.72,bounds.y+bounds.height*.48,{steps:8});await page.mouse.up();
 await expect(page.locator('#avatarMount')).not.toHaveAttribute('data-camera',initialCamera);
 const rotatedCamera=await page.locator('#avatarMount').getAttribute('data-camera');
 await page.mouse.wheel(0,-350);
 await expect(page.locator('#avatarMount')).not.toHaveAttribute('data-camera',rotatedCamera);
 expect(await background()).toContain('courtyard.webp');
 await page.screenshot({path:'test-results/student-scholar-desktop.png'});
 await page.emulateMedia({reducedMotion:'no-preference'});await page.reload();
 await page.getByRole('button',{name:'開始製作',exact:true}).click();
 await expect(page.locator('#avatarMount')).toHaveAttribute('data-model','scholar');
 await expect(page.locator('#avatarMount')).toHaveAttribute('data-action','nod');
 await page.route('https://openrouter.ai/api/v1/chat/completions',route=>route.fulfill({json:{choices:[{message:{content:'這是一段動作測試回覆。'.repeat(90)}}]}}));
 await page.locator('#apiKey').fill('sk-or-scholar-test');await page.getByRole('button',{name:'連接',exact:true}).click();
 await page.locator('#message').fill('請解釋');await page.locator('#send').click();
 await expect(page.locator('#avatarMount')).toHaveAttribute('data-speaking','true');
 for(const action of ['nod','explain','emphasis'])await expect(page.locator('#avatarMount')).toHaveAttribute('data-action',action,{timeout:10000});
 await page.locator('#clearChat').click();await expect(page.locator('#avatarMount')).toHaveAttribute('data-speaking','false');
 await page.locator('[data-avatar="school"]').click();
 await expect(page.locator('.character')).toHaveAttribute('data-avatar','school');expect(await background()).toContain('classroom.webp');
 expect(failed).toEqual([]);
});
test('cancelling a reduced-motion preview restores the exact resting scholar pose',async({page})=>{
 await page.locator('[data-avatar="scholar"]').click();await expect(page.locator('#avatarMount')).toHaveAttribute('data-model','scholar');
 const canvas=page.locator('#avatarMount canvas');const resting=await canvas.screenshot();
 await page.locator('#movementSelect').selectOption('wave');await page.waitForTimeout(900);
 expect((await canvas.screenshot()).equals(resting)).toBe(false);
 await page.locator('#clearChat').click();await page.waitForTimeout(100);
 expect((await canvas.screenshot()).equals(resting)).toBe(true);
});
test('school VRM renders and responsive layouts do not overflow',async({page})=>{
 test.setTimeout(180000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await expect(page).toHaveTitle('數字人製作');
 await expect(page.locator('.brand')).toHaveText('數字人製作');
 await expect(page.locator('.brand svg[aria-label="人形機械人"]')).toHaveCount(1);
 await expect(page.locator('.character-caption')).toHaveText('知微');
 for(const width of [1440,1600,2560]){
  await page.setViewportSize({width,height:1000});
  const positions=await page.locator('.panel .section-label').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));
  expect(Math.max(...positions)-Math.min(...positions)).toBeLessThanOrEqual(1);
 }
 const wideBounds=await page.locator('.workspace').boundingBox();expect(wideBounds.x).toBe(0);expect(wideBounds.width).toBe(await page.evaluate(()=>document.documentElement.clientWidth));
 await page.setViewportSize({width:1440,height:1000});
 expect(await page.locator('#message').evaluate(n=>parseFloat(getComputedStyle(n).fontSize))).toBeGreaterThanOrEqual(16);
 await expect(page.locator('#avatarStatus')).toHaveText('',{timeout:60000});
 await expect(page.locator('#avatarMount canvas')).toBeVisible();
 await expect.poll(async()=>{const value=await page.locator('#avatarMount').getAttribute('data-arm-lowering');return value?value.split(',').map(Number).filter(Number.isFinite).length:0;}).toBe(2);
 const armAngles=(await page.locator('#avatarMount').getAttribute('data-arm-lowering')).split(',').map(Number);
 expect(Math.min(...armAngles)).toBeGreaterThan(50);
 await page.locator('#movementSelect').selectOption('wave');await expect(page.locator('#avatarMount')).toHaveAttribute('data-preview','wave');
 await expect(page.locator('#avatarMount')).not.toHaveAttribute('data-preview',/./,{timeout:10000});
 await expect(page.locator('#connection')).toHaveCount(0);
 await expect(page.locator('#connectDialog')).toHaveCount(0);
 await expect(page.locator('#customizePanel .api-settings')).toHaveCount(1);
 await page.route('https://openrouter.ai/api/v1/chat/completions',route=>route.fulfill({json:{choices:[{message:{content:'這是一段動作測試回覆。'.repeat(100)}}]}}));
 await page.locator('#apiKey').focus();await page.locator('#apiKey').fill('sk-or-v1-test-only');
 await page.getByRole('button',{name:'連接',exact:true}).click();
 await page.locator('#message').fill('請解釋這個題目');await page.locator('#send').click();
 await expect(page.locator('#avatarMount')).toHaveAttribute('data-speaking','true');
 await expect(page.locator('#avatarMount')).toHaveAttribute('data-action','nod');
 await expect(page.locator('#avatarMount')).toHaveAttribute('data-action','explain',{timeout:15000});
 await expect(page.locator('#avatarMount')).toHaveAttribute('data-action','emphasis',{timeout:15000});
 await expect(page.locator('#avatarMount')).toHaveAttribute('data-speaking','false',{timeout:25000});
 await page.locator('#clearChat').click();
 await page.locator('#customizePanel').evaluate(node=>{node.scrollTop=0;});
 await page.screenshot({path:'test-results/student-desktop.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/student-mobile.png',fullPage:true});
 expect(errors).toEqual([]);
 await page.locator('[data-avatar="scholar"]').click();
 await expect(page.locator('#avatarMount canvas')).toBeVisible();
 await expect(page.locator('#avatarStatus')).toHaveText('');
 await expect(page.locator('#avatarMount')).toHaveAttribute('data-model','scholar');
 await expect(page.locator('.character')).toHaveAttribute('data-avatar','scholar');
 await page.screenshot({path:'test-results/student-scholar-mobile.png',fullPage:true});
});
