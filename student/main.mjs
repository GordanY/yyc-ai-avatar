import './core.mjs';
import { CONFIG } from './config.mjs';
import { DEFAULT_PROFILE, PERSONALITIES, TONES, normalizeProfile, wordCount, systemPrompt, contextEstimate, actionFor, readQuota, consumeQuota, validateMessage } from './core.mjs';
import { AvatarStage } from './avatar.mjs';
const $=id=>document.getElementById(id);
let profile=normalizeProfile(DEFAULT_PROFILE),messages=[],apiKey='',revision=0,controller=null,busy=false,storage=null,quota=50;
let exactTokens=null,contextWindow=CONFIG.contextWindow;
try { const saved=localStorage.getItem('yyc.student.profile.v1');if(saved)profile=normalizeProfile(JSON.parse(saved)); }catch{}
try { storage=sessionStorage;quota=readQuota(storage); }catch{storage=null;}
const avatar=new AvatarStage($('avatarMount'),$('avatarStatus'));
const welcome=$('welcome');
function notice(text,error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);}
function modeNotice(){notice(apiKey?'已連接 · 文字與角色設定會直接傳送至 OpenRouter。':'示範模式：回應為本機範例。連接 OpenRouter 後可與 AI 對話。');}
function addMessage(role,text) {
  welcome.remove();const node=document.createElement('div');node.className='bubble '+role;
  if(role==='assistant'){const label=document.createElement('span');label.className='byline';label.textContent=profile.name||'學習伙伴';node.append(label);}
  const body=document.createElement('span');body.textContent=text;node.append(body);
  $('messages').append(node);$('messages').scrollTop=$('messages').scrollHeight;return body;
}
function updateLabels(){
  const name=profile.name||'學習伙伴';
  $('characterName').textContent=name;welcome.querySelector('#welcomeName').textContent=name;
  $('characterSummary').textContent=profile.personalities.join(' · ')||profile.tone;
  $('quotaLabel').textContent='本次提問 '+quota+' / '+CONFIG.maxMessages;
  const value=exactTokens??contextEstimate(profile,messages);
  const percent=Math.min(100,value/contextWindow*100);
  $('contextValue').textContent=value.toLocaleString()+' tokens · '+percent.toFixed(1)+'%';
  $('tokenLabel').textContent=exactTokens===null?'估算':'上次實際';
  $('contextProgress').value=percent;
  const words=wordCount($('message').value);
  $('wordCounter').textContent=words+' / 200 字／詞';
  $('wordCounter').classList.toggle('over-limit',words>CONFIG.maxWords);
  $('send').disabled=busy||!storage||quota>=CONFIG.maxMessages||words>CONFIG.maxWords||!$('message').value.trim();
  document.querySelectorAll('[data-avatar]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.avatar===profile.avatar)));
}
function clearContext(text){
  revision++;controller?.abort();controller=null;busy=false;messages=[];exactTokens=null;
  $('messages').replaceChildren(welcome);$('message').value='';$('send').innerHTML='傳送 <span aria-hidden="true">↑</span>';
  avatar.reset();updateLabels();if(text)notice(text);
}
function persistProfile(){try{localStorage.setItem('yyc.student.profile.v1',JSON.stringify(profile));}catch{}}
function changed(){
  profile=normalizeProfile({...profile,name:$('agentName').value,description:$('description').value,knowledge:$('knowledge').value,
    personalities:[...document.querySelectorAll('input[name="personality"]:checked')].map(x=>x.value),
    tone:document.querySelector('input[name="tone"]:checked')?.value});
  persistProfile();clearContext('設定已更新，角色與對話已重新開始。提問次數保留。');
}
$('agentName').value=profile.name;$('description').value=profile.description;$('knowledge').value=profile.knowledge;
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
$('profileForm').addEventListener('submit',e=>e.preventDefault());
document.querySelectorAll('[data-avatar]').forEach(button=>button.addEventListener('click',()=>{
  if(profile.avatar===button.dataset.avatar)return;
  profile.avatar=button.dataset.avatar;persistProfile();clearContext('外觀已切換，對話已重新開始。提問次數保留。');
  avatar.show(profile.avatar);
}));
$('message').addEventListener('input',updateLabels);
$('message').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('chatForm').requestSubmit();}});
document.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>{$('message').value=b.dataset.prompt;updateLabels();$('message').focus();}));
$('clearChat').addEventListener('click',()=>clearContext('已清空對話。提問次數保留。'));
$('connection').addEventListener('click',()=>{$('apiKey').value='';$('keyNotice').textContent='';$('connectDialog').showModal();});
$('closeDialog').addEventListener('click',()=>$('connectDialog').close());
function setKey(key) {
  apiKey=key;$('apiKey').value='';$('connection').classList.toggle('connected',!!apiKey);
  $('connection').querySelector('span').textContent=apiKey?'已連接 OpenRouter':'示範模式';
  clearContext();modeNotice();$('connectDialog').close();
}
$('keyForm').addEventListener('submit',e=>{
  e.preventDefault();const key=$('apiKey').value.trim();
  if(!/^sk-or-[A-Za-z0-9_-]+$/.test(key)){$('keyNotice').textContent='請輸入有效格式的 OpenRouter API key。';return;}
  setKey(key);
});
$('disconnect').addEventListener('click',()=>setKey(''));
$('connectDialog').addEventListener('close',()=>{$('apiKey').value='';});
window.addEventListener('pagehide',()=>{apiKey='';controller?.abort();});
function demoReply(text) {
  const p=profile,name=p.name||'學習伙伴';
  const intro=p.tone==='正式有禮'?'您好。':p.tone==='輕鬆活潑'?'嗨！':p.tone==='簡潔直接'?'你好。':'你好呀。';
  const personality=p.personalities.length?'我的個性設定是「'+p.personalities.join('、')+'」。':'';
  if(/介紹|你是誰/.test(text))return intro+'我是'+name+'。'+p.description+'\n\n'+personality+'我的語氣是「'+p.tone+'」。\n\n這是示範回應；連接 OpenRouter 後，我會依照你的設定與背景資料回答。';
  return intro+name+'收到你的問題了。\n\n'+(p.tone==='簡潔直接'?'先把問題分成小步驟，再逐步解決。':p.personalities.includes('幽默')?'學習像練功，先從一個小招式開始！你想先處理哪一部分？':'我們可以把問題分成幾個小步驟。你已經知道甚麼，又有哪些地方想弄清楚？')+
    '\n\n'+(p.knowledge?'已加入 '+p.knowledge.length+' 字元背景資料。示範模式不會分析資料；請連接 OpenRouter 測試知識如何影響回答。':'你可以加入背景資料，讓角色了解你的學習內容。');
}
$('chatForm').addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;
  const text=$('message').value.trim();let error='';
  try{quota=readQuota(storage);}catch{notice('瀏覽器無法儲存提問次數。請允許此網站使用工作階段儲存，再重新整理。',true);return;}
  const estimated=contextEstimate(profile,messages);
  error=validateMessage(text,quota,Math.max(estimated,exactTokens??0),contextWindow);
  if(error){notice(error,true);updateLabels();return;}
  try { quota=consumeQuota(storage); }catch{notice('無法儲存提問次數，訊息未傳送。',true);return;}
  busy=true;exactTokens=null;const requestRevision=revision;
  const history=[...messages,{role:'user',content:text}];
  messages=history;addMessage('user',text);$('message').value='';$('send').textContent='回覆中⋯';updateLabels();
  avatar.play(actionFor(text));notice(apiKey?'正在思考⋯':'示範回應 · 不會呼叫 AI');
  let pending=addMessage('assistant','思考中⋯');
  try {
    let reply,usage;
    if(!apiKey) {
      await new Promise(resolve=>setTimeout(resolve,500));
      reply=demoReply(text);
    } else {
      controller=new AbortController();
      const timer=setTimeout(()=>controller?.abort(),60000);
      let response;
      try {
        response=await fetch('https://openrouter.ai/api/v1/chat/completions',{
          method:'POST',signal:controller.signal,
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
          body:JSON.stringify({model:CONFIG.model,messages:[{role:'system',content:systemPrompt(profile)},...history],max_tokens:CONFIG.replyTokens,temperature:.7,stream:false})
        });
      } finally {clearTimeout(timer);}
      if(!response.ok) {
        const friendly={401:'API key 無效，請重新輸入。',402:'OpenRouter 餘額不足，請檢查帳戶。',403:'此金鑰未獲准使用，請檢查 OpenRouter 設定。',429:'請求太頻密，請稍後再試。'};
        throw new Error(friendly[response.status]||'暫時未能取得回覆，請稍後再試。');
      }
      const data=await response.json();reply=data.choices?.[0]?.message?.content;usage=data.usage;
      if(typeof reply!=='string'||!reply.trim())throw new Error('未收到文字回覆，請稍後再試。');
    }
    if(requestRevision!==revision)return;
    pending.textContent=reply;messages.push({role:'assistant',content:reply});
    if(Number.isFinite(usage?.total_tokens))exactTokens=usage.total_tokens;
    avatar.play(actionFor(reply));modeNotice();
  } catch(error) {
    if(requestRevision!==revision)return;
    pending.closest('.bubble').remove();
    // Failed requests count as submitted inputs, but do not pollute the next request's context.
    messages=messages.slice(0,-1);
    notice(error.name==='AbortError'?'回覆已逾時。你可以再次傳送；本次提問已計入次數。':error.message+' 本次提問已計入次數。',true);
    $('message').value=text;
  } finally {
    if(requestRevision===revision){busy=false;controller=null;$('send').innerHTML='傳送 <span aria-hidden="true">↑</span>';updateLabels();$('messages').scrollTop=$('messages').scrollHeight;}
  }
});
updateLabels();avatar.show(profile.avatar);
if(!storage)notice('瀏覽器未允許儲存工作階段。請允許儲存後重新整理，才能使用聊天。',true);
// Public metadata only: never transmit the API key to discover model capacity.
fetch('https://openrouter.ai/api/v1/models').then(r=>r.ok?r.json():null).then(data=>{
  const capacity=data?.data?.find(m=>m.id===CONFIG.model)?.context_length;
  if(Number.isFinite(capacity)&&capacity>CONFIG.replyTokens){contextWindow=capacity;updateLabels();}
}).catch(()=>{});
