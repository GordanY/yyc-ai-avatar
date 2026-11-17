import './core.mjs';
import { CONFIG, MOVEMENTS } from './config.mjs';
import { DEFAULT_PROFILE, PERSONALITIES, TONES, normalizeProfile, wordCount, systemPrompt, contextEstimate, actionFor, readQuota, consumeQuota, validateMessage } from './core.mjs';
import { AvatarStage } from './avatar.mjs';
import { normalizeApiKey, validateApiKey } from './openrouter.mjs';
import { TEMPLATES } from './templates.mjs';
import { starterQuestions, parseChatReply } from './followups.mjs';
import { requestChatCompletion, formatCompletionDiagnostics } from './chat-completion.mjs';
const $=id=>document.getElementById(id);
let profile=normalizeProfile(DEFAULT_PROFILE),messages=[],apiKey='',revision=0,controller=null,busy=false,storage=null,quota=50;
let exactTokens=null,contextWindow=CONFIG.contextWindow;
let keyRevision=0,keyController=null;
let adminMode=false;
try { const saved=localStorage.getItem('yyc.student.profile.v1');if(saved)profile=normalizeProfile(JSON.parse(saved)); }catch{}
try { storage=sessionStorage;quota=readQuota(storage); }catch{storage=null;}
const avatar=new AvatarStage($('avatarMount'),$('avatarStatus'));
const welcome=$('welcome');
$('toggleSettings').addEventListener('click',()=>{
  const collapsed=document.querySelector('.workspace').classList.toggle('settings-hidden');
  $('customizePanel').hidden=collapsed;
  $('toggleSettings').textContent=collapsed?'顯示角色設定':'隱藏角色設定';
  $('toggleSettings').setAttribute('aria-expanded',String(!collapsed));
});
function notice(text,error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);}
function setConnectionState(state){
  $('connectAI').dataset.connectionState=state;$('connectAI').classList.toggle('connected',state==='connected');
  $('connectAI').title=state==='error'?'最近的 API 請求失敗':state==='connected'?'已連接 · OpenRouter':'連接AI model';
  $('connectionStatus').classList.toggle('connected',state==='connected');
  $('connectionStatus').textContent=state==='error'?(apiKey?'最近請求失敗 · 請重試或重新連接':'未連接 · 請檢查金鑰與網絡'):state==='connected'?'已驗證 · OpenRouter':'未連接 OpenRouter';
}
function showResponseDiagnostics(info){
  $('responseDiagnostics').hidden=!info;$('responseDiagnostics').open=false;
  $('responseDetails').textContent=info?formatCompletionDiagnostics(info):'';
}
function modeNotice(){notice(apiKey?'已連接 · 文字與角色設定會直接傳送至 OpenRouter。':'請先按右上角「連接AI model」，連接後開始對話。');}
function showQuestions(questions){
  const row=$('followupQuestions');row.replaceChildren();
  for(const question of questions){
    const button=document.createElement('button');button.type='button';button.dataset.prompt=question;button.textContent=question;row.append(button);
  }
}
function addMessage(role,text) {
  welcome.remove();const node=document.createElement('div');node.className='bubble '+role;
  if(role==='assistant'){const label=document.createElement('span');label.className='byline';label.textContent=profile.name||'學習伙伴';node.append(label);}
  const body=document.createElement('span');body.textContent=text;node.append(body);
  $('messages').append(node);$('messages').scrollTop=$('messages').scrollHeight;return body;
}
function updateLabels(){
  const name=profile.name||'學習伙伴';
  $('characterName').textContent=name;welcome.querySelector('#welcomeName').textContent=name;
  $('quotaLabel').textContent='本次提問 '+quota+' / '+CONFIG.maxMessages;
  const value=exactTokens??contextEstimate(profile,messages);
  const percent=Math.min(100,value/contextWindow*100);
  $('contextValue').textContent=value.toLocaleString()+' tokens · '+percent.toFixed(1)+'%';
  $('tokenLabel').textContent=exactTokens===null?'估算':'上次實際';
  $('contextProgress').value=percent;
  const words=wordCount($('message').value);
  $('wordCounter').textContent=words+' / 200 字／詞';
  $('wordCounter').classList.toggle('over-limit',words>CONFIG.maxWords);
  $('send').disabled=busy||!!keyController||!apiKey||!storage||quota>=CONFIG.maxMessages||words>CONFIG.maxWords||!$('message').value.trim();
  $('followupQuestions').hidden=busy;
  document.querySelectorAll('[data-avatar]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.avatar===profile.avatar)));
}
function clearContext(text){
  revision++;controller?.abort();controller=null;busy=false;messages=[];exactTokens=null;
  $('messages').replaceChildren(welcome);$('message').value='';$('send').innerHTML='傳送 <span aria-hidden="true">↑</span>';
  showQuestions(starterQuestions(profile));
  showResponseDiagnostics(null);
  avatar.reset();updateLabels();if(text)notice(text);
  $('movementSelect').value='';$('replayMovement').disabled=true;
}
function persistProfile(){try{localStorage.setItem('yyc.student.profile.v1',JSON.stringify(profile));}catch{}}
function changed(){
  $('settingsStatus').textContent='有未套用的修改。按「更新數字人」套用設定並重新開始對話。';
  $('settingsStatus').classList.add('unsaved');
}
function fillProfileForm(){
  $('agentName').value=profile.name;$('description').value=profile.description;$('knowledge').value=profile.knowledge;
  document.querySelectorAll('input[name="personality"]').forEach(input=>{input.checked=profile.personalities.includes(input.value);});
  document.querySelectorAll('input[name="tone"]').forEach(input=>{input.checked=input.value===profile.tone;});
  $('settingsStatus').textContent='目前沒有未套用的修改。';$('settingsStatus').classList.remove('unsaved');
  showTemplateSources(Object.values(TEMPLATES).find(template=>template.profile.knowledge===profile.knowledge));
}
function saveSettings(){
  if(!$('profileForm').reportValidity())return;
  profile=normalizeProfile({...profile,name:$('agentName').value,description:$('description').value,knowledge:$('knowledge').value,
    personalities:[...document.querySelectorAll('input[name="personality"]:checked')].map(x=>x.value),
    tone:document.querySelector('input[name="tone"]:checked')?.value});
  let persisted=true;
  try{localStorage.setItem('yyc.student.profile.v1',JSON.stringify(profile));}catch{persisted=false;}
  fillProfileForm();
  clearContext('數字人已更新，對話已重新開始。提問次數保留。');
  if(!persisted){
    $('settingsStatus').textContent='已套用設定，但瀏覽器不允許儲存到此裝置；重新整理後可能遺失。';
    notice('已套用設定，但無法儲存到此裝置。請允許網站儲存資料。',true);
  }
}
$('saveSettings').addEventListener('click',saveSettings);
function showTemplateSources(template){
  $('templateSourceList').replaceChildren();$('templateSources').hidden=!template;
  for(const source of template?.sources||[]){
    const item=document.createElement('li'),link=document.createElement('a');link.href=source.url;
    link.textContent=source.title;link.target='_blank';link.rel='noopener noreferrer';item.append(link);$('templateSourceList').append(item);
  }
}
$('profileTemplate').addEventListener('change',()=>{$('refreshTemplate').disabled=!TEMPLATES[$('profileTemplate').value];});
$('refreshTemplate').addEventListener('click',()=>{
  const template=TEMPLATES[$('profileTemplate').value];if(!template)return;
  profile=normalizeProfile(template.profile);persistProfile();fillProfileForm();showTemplateSources(template);
  clearContext('已載入「'+template.label+'」範本，對話已重新開始。提問次數與連接保留。');
  avatar.show(profile.avatar);$('agentName').focus();
});
for(const movement of MOVEMENTS){
  const option=document.createElement('option');option.value=movement.id;option.textContent=movement.number+'. '+movement.label;$('movementSelect').append(option);
}
function syncMovementControls(){
  $('movementSelect').disabled=!$('avatarMount').dataset.model;
  $('replayMovement').disabled=$('movementSelect').disabled||!$('movementSelect').value;
}
new MutationObserver(syncMovementControls).observe($('avatarMount'),{attributes:true,attributeFilter:['data-model']});
function previewMovement(){
  const action=$('movementSelect').value;if(action)avatar.preview(action);syncMovementControls();
}
$('movementSelect').addEventListener('change',previewMovement);
$('replayMovement').addEventListener('click',previewMovement);
fillProfileForm();
function choices(container,values,name,type,selected){
  for(const value of values){
    const label=document.createElement('label');label.className='choice';
    const input=document.createElement('input');input.type=type;input.name=name;input.value=value;input.checked=selected.includes(value);
    label.append(input,document.createTextNode(value));$(container).append(label);
  }
}
choices('personalities',PERSONALITIES,'personality','checkbox',profile.personalities);
choices('tones',TONES,'tone','radio',[profile.tone]);
$('profileForm').addEventListener('input',changed);
$('profileForm').addEventListener('submit',e=>{e.preventDefault();saveSettings();});
document.querySelectorAll('[data-avatar]').forEach(button=>button.addEventListener('click',()=>{
  if(profile.avatar===button.dataset.avatar)return;
  profile.avatar=button.dataset.avatar;persistProfile();clearContext('外觀已切換，對話已重新開始。提問次數保留。');
  avatar.show(profile.avatar);
}));
$('message').addEventListener('input',updateLabels);
$('message').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('chatForm').requestSubmit();}});
$('followupQuestions').addEventListener('click',event=>{
  const button=event.target.closest('button[data-prompt]');if(!button)return;
  $('message').value=button.dataset.prompt;updateLabels();$('message').focus();
});
$('clearChat').addEventListener('click',()=>clearContext('已清空對話。提問次數保留。'));
function hideKey(){
  $('apiKey').type='password';
  $('toggleKeyVisibility').setAttribute('aria-pressed','false');
  $('toggleKeyVisibility').setAttribute('aria-label','顯示金鑰');
  $('toggleKeyVisibility').title='顯示金鑰';
}
$('toggleKeyVisibility').addEventListener('click',()=>{
  const input=$('apiKey'),start=input.selectionStart,end=input.selectionEnd;
  const visible=input.type==='password';input.type=visible?'text':'password';
  $('toggleKeyVisibility').setAttribute('aria-pressed',String(visible));
  $('toggleKeyVisibility').setAttribute('aria-label',visible?'隱藏金鑰':'顯示金鑰');
  $('toggleKeyVisibility').title=visible?'隱藏金鑰':'顯示金鑰';
  input.focus();if(start!==null&&end!==null)input.setSelectionRange(start,end);
});
$('connectAI').addEventListener('click',()=>{hideKey();$('connectDialog').showModal();$('apiKey').focus();});
function cancelConnectionCheck(){
  const wasChecking=!!keyController;cancelKeyCheck();hideKey();
  if(wasChecking)$('keyNotice').textContent='驗證已取消。';
}
$('closeConnectDialog').addEventListener('click',()=>{cancelConnectionCheck();$('connectDialog').close();});
$('connectDialog').addEventListener('cancel',cancelConnectionCheck);
$('connectDialog').addEventListener('close',cancelConnectionCheck);
function cancelKeyCheck(){
  keyRevision++;keyController?.abort();keyController=null;
  const button=$('keyForm').querySelector('[type="submit"]');button.disabled=false;button.textContent='連接';
  updateLabels();
}
$('apiKey').addEventListener('input',()=>{cancelKeyCheck();$('keyNotice').textContent='';});
function setKey(key) {
  cancelKeyCheck();
  apiKey=key;$('apiKey').value=key;hideKey();
  setConnectionState(apiKey?'connected':'disconnected');
  $('keyNotice').textContent=apiKey?'金鑰驗證成功，可開始文字對話。':'連接已清除。';
  const draft=$('message').value;clearContext();$('message').value=draft;updateLabels();modeNotice();
}
$('keyForm').addEventListener('submit',async e=>{
  e.preventDefault();cancelKeyCheck();
  let key;
  try{key=normalizeApiKey($('apiKey').value);}catch(error){setConnectionState('error');$('keyNotice').textContent=error.message;return;}
  const requestRevision=keyRevision,check=new AbortController();keyController=check;
  updateLabels();
  const button=$('keyForm').querySelector('[type="submit"]');button.disabled=true;button.textContent='驗證中⋯';
  $('keyNotice').textContent='正在向 OpenRouter 驗證金鑰⋯';
  const timer=setTimeout(()=>check.abort(),15000);
  try{
    await validateApiKey(key,check.signal);
    if(requestRevision!==keyRevision||!$('connectDialog').open)return;
    setKey(key);
    $('connectDialog').close();$('message').focus();
  }catch(error){
    if(requestRevision!==keyRevision)return;
    setConnectionState('error');
    $('keyNotice').textContent=error.name==='AbortError'?'驗證已逾時，請重試。':error.message;
  }finally{
    clearTimeout(timer);
    if(requestRevision===keyRevision){keyController=null;button.disabled=false;button.textContent='連接';updateLabels();}
  }
});
function setAdminMode(value){
  adminMode=value;$('enterAdminMode').hidden=value;$('adminReset').hidden=!value;$('exitAdminMode').hidden=!value;
}
$('enterAdminMode').addEventListener('click',()=>{
  $('adminPassword').value='';$('adminLoginNotice').textContent='';
  $('adminLoginDialog').showModal();$('adminPassword').focus();
});
$('cancelAdminLogin').addEventListener('click',()=>$('adminLoginDialog').close());
$('adminLoginDialog').addEventListener('close',()=>{$('adminPassword').value='';$('adminLoginNotice').textContent='';});
$('adminLoginForm').addEventListener('submit',e=>{
  e.preventDefault();
  if($('adminPassword').value!==CONFIG.adminResetPassword){
    $('adminLoginNotice').textContent='密碼不正確，未有重設任何資料。';$('adminPassword').focus();$('adminPassword').select();return;
  }
  setAdminMode(true);$('adminLoginDialog').close();$('adminReset').focus();
});
$('exitAdminMode').addEventListener('click',()=>{setAdminMode(false);$('adminResetDialog').close();$('enterAdminMode').focus();});
$('adminReset').addEventListener('click',()=>{if(adminMode)$('adminResetDialog').showModal();});
$('cancelAdminReset').addEventListener('click',()=>$('adminResetDialog').close());
$('adminResetForm').addEventListener('submit',e=>{
  e.preventDefault();
  if(!adminMode)return;
  // Invalidate pending fetches and typewriter replies before restoring defaults.
  clearContext();
  profile=normalizeProfile(DEFAULT_PROFILE);exactTokens=null;
  let profileCleared=true,quotaCleared=true;
  try{localStorage.removeItem('yyc.student.profile.v1');}catch{profileCleared=false;}
  try{storage=sessionStorage;storage.setItem('yyc.student.quota.v1','0');quota=readQuota(storage);}
  catch{storage=null;quota=CONFIG.maxMessages;quotaCleared=false;}
  setKey('');$('connectDialog').close();$('keyNotice').textContent='';fillProfileForm();
  $('profileTemplate').value='';$('refreshTemplate').disabled=true;showTemplateSources(null);
  document.querySelector('.workspace').classList.remove('settings-hidden');
  $('customizePanel').hidden=false;$('customizePanel').scrollTop=0;
  $('toggleSettings').textContent='隱藏角色設定';$('toggleSettings').setAttribute('aria-expanded','true');
  avatar.show(profile.avatar);updateLabels();$('adminResetDialog').close();
  if(profileCleared&&quotaCleared)notice('已重設全部設定、對話、API 金鑰及提問次數。');
  else notice('已清除頁面資料，但瀏覽器未允許完整重設儲存資料。請允許網站儲存資料後再試。',true);
  $('agentName').focus();
});
window.addEventListener('pagehide',()=>{revision++;cancelKeyCheck();apiKey='';$('apiKey').value='';hideKey();controller?.abort();controller=null;busy=false;setConnectionState('disconnected');updateLabels();});
async function revealReply(node,text,requestRevision){
  const characters=Array.from(text),start=performance.now();
  node.textContent='';avatar.setSpeaking(true);
  while(true){
    if(requestRevision!==revision)return false;
    const count=Math.min(characters.length,Math.max(1,Math.floor((performance.now()-start)/1000*CONFIG.replyCharactersPerSecond)));
    node.textContent=characters.slice(0,count).join('');
    $('messages').scrollTop=$('messages').scrollHeight;
    if(count===characters.length)return true;
    await new Promise(resolve=>setTimeout(resolve,30));
  }
}
$('chatForm').addEventListener('submit',async e=>{
  e.preventDefault();if(busy||keyController)return;
  if(!apiKey){notice('請先連接 OpenRouter，再傳送問題。',true);return;}
  const text=$('message').value.trim();let error='';
  try{quota=readQuota(storage);}catch{notice('瀏覽器無法儲存提問次數。請允許此網站使用工作階段儲存，再重新整理。',true);return;}
  const estimated=contextEstimate(profile,messages);
  error=validateMessage(text,quota,Math.max(estimated,exactTokens??0),contextWindow);
  if(error){notice(error,true);updateLabels();return;}
  try { quota=consumeQuota(storage); }catch{notice('無法儲存提問次數，訊息未傳送。',true);return;}
  showResponseDiagnostics(null);
  busy=true;exactTokens=null;const requestRevision=revision;
  const history=[...messages,{role:'user',content:text}];
  messages=history;addMessage('user',text);$('message').value='';$('send').textContent='回覆中⋯';updateLabels();
  avatar.play(actionFor(text));notice('正在思考⋯');
  let pending=addMessage('assistant','思考中⋯');
  let responseInfo=null;
  try {
    const requestController=new AbortController();controller=requestController;
    const completion=await requestChatCompletion({model:CONFIG.model,messages:[{role:'system',content:systemPrompt(profile)},...history],max_tokens:CONFIG.replyTokens,temperature:.7,stream:false},
      apiKey,{controller:requestController,timeoutMs:CONFIG.responseTimeoutMs});
    const {reply,usage}=completion;responseInfo=completion.diagnostics;
    if(requestRevision!==revision)return;
    let parsed;
    try{parsed=parseChatReply(reply,text);}catch{throw new Error('服務只回傳建議問題，沒有回答正文。請重新傳送。');}
    setConnectionState('connected');
    if(!await revealReply(pending,parsed.reply,requestRevision))return;
    messages.push({role:'assistant',content:parsed.reply});showQuestions(parsed.questions);
    if(Number.isFinite(usage?.total_tokens))exactTokens=usage.total_tokens;
    avatar.setSpeaking(false);modeNotice();
  } catch(error) {
    if(requestRevision!==revision)return;
    setConnectionState('error');showResponseDiagnostics(error.completionDiagnostics||responseInfo);
    pending.closest('.bubble').remove();
    // Failed requests count as submitted inputs, but do not pollute the next request's context.
    messages=messages.slice(0,-1);
    notice(error.name==='AbortError'?'回覆已逾時。你可以再次傳送；本次提問已計入次數。':error.message+' 本次提問已計入次數。',true);
    $('message').value=text;
  } finally {
    if(requestRevision===revision){avatar.setSpeaking(false);busy=false;controller=null;$('send').innerHTML='傳送 <span aria-hidden="true">↑</span>';updateLabels();$('messages').scrollTop=$('messages').scrollHeight;}
  }
});
$('welcomeStart').addEventListener('click',()=>{
  $('welcomeDialog').close();$('agentName').focus();
});
showQuestions(starterQuestions(profile));updateLabels();modeNotice();avatar.show(profile.avatar);
$('welcomeDialog').showModal();
if(!storage)notice('瀏覽器未允許儲存工作階段。請允許儲存後重新整理，才能使用聊天。',true);
// Public metadata only: never transmit the API 金鑰 to discover model capacity.
fetch('https://openrouter.ai/api/v1/models').then(r=>r.ok?r.json():null).then(data=>{
  const capacity=data?.data?.find(m=>m.id===CONFIG.model)?.context_length;
  if(Number.isFinite(capacity)&&capacity>CONFIG.replyTokens){contextWindow=capacity;updateLabels();}
}).catch(()=>{});
