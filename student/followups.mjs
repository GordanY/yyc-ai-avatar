import { TEMPLATES } from './templates.mjs';

export const FOLLOWUP_MARKER='[[FOLLOW_UP_QUESTIONS]]';
export const FOLLOWUP_INSTRUCTION=[
  '先正常回答使用者的問題。回答正文後另起一行寫 '+FOLLOWUP_MARKER+'，下一行只放一個包含兩個字串的 JSON 陣列。',
  '這兩個字串是學生可以接著問你的追問，須與本次回答相關、簡短、互不重複，並使用回答相同的語言。',
  '每題最多18個中文字或8個英文單字，以問號結尾。不要在回答正文內提及這個格式，也不要替學生回答這兩題。',
  '不要重複使用者剛問過的問題。',
].join('\n');

const DEFAULT_STARTERS=['你可以怎樣幫助我？','你最擅長甚麼？'];
const DEFAULT_FOLLOWUPS=['可以再解釋一下嗎？','你能舉個例子嗎？'];

export function starterQuestions(profile){
  const template=Object.values(TEMPLATES).find(item=>item.profile.name===profile.name);
  return [...(template?.starterQuestions||DEFAULT_STARTERS)];
}

function shortQuestions(candidates,fallback){
  const questions=[],seen=new Set();
  for(const value of [...(Array.isArray(candidates)?candidates:[]),...fallback]){
    if(typeof value!=='string')continue;
    let question=value.replace(/^\s*(?:\d+[.)、]|[-•])\s*/,'').replace(/\s+/gu,' ').trim();
    if(!/[\p{L}\p{N}]/u.test(question))continue;
    if(!/[?？]$/.test(question))question+=/\p{Script=Han}/u.test(question)?'？':'?';
    if(Array.from(question).length>64||(question.match(/\p{Script=Han}/gu)||[]).length>24)continue;
    const key=question.replace(/[?？]+$/,'').toLowerCase();
    if(seen.has(key))continue;
    questions.push(question);seen.add(key);if(questions.length===2)break;
  }
  return questions;
}

export function parseChatReply(content,languageHint=''){
  const raw=content.trim();
  const blocks=[...raw.matchAll(/(?:^|\n)[\t ]*\[\[FOLLOW_UP_QUESTIONS\]\][\t ]*(?=\r?\n|$)/gi)];
  const marker=blocks.at(-1);
  let reply=raw,questions;
  if(marker){
    reply=raw.slice(0,marker.index).trim();
    const metadata=raw.slice(marker.index+marker[0].length).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
    try{questions=JSON.parse(metadata);}catch{}
  }else{
    // A token-limited answer may stop in the metadata marker; keep its prose.
    reply=raw.replace(/\n\s*\[\[FOLLOW[_A-Z]*\]?$/i,'').trim();
  }
  if(!reply)throw new Error('未收到文字回覆，請稍後再試。');
  const language=reply+' '+languageHint;
  const fallback=!/\p{Script=Han}/u.test(language)&&/[a-z]/i.test(language)?['Can you explain that more?','Can you give an example?']:DEFAULT_FOLLOWUPS;
  return {reply,questions:shortQuestions(questions,fallback)};
}
