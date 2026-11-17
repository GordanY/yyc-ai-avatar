const count=value=>Number.isFinite(value)&&value>=0?Math.floor(value):null;
const hasText=value=>typeof value==='string'&&!!value.trim();

export async function requestChatCompletion(payload,apiKey,{controller,timeoutMs,fetcher=fetch}){
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetcher('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',signal:controller.signal,
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+apiKey},body:JSON.stringify(payload)
    });
    if(!response.ok){
      const messages={401:'API 金鑰 無效，請重新輸入。',402:'OpenRouter 餘額不足，請檢查帳戶。',403:'此金鑰未獲准使用，請檢查 OpenRouter 設定。',429:'請求太頻密，請稍後再試。'};
      throw new Error(messages[response.status]||'暫時未能取得回覆，請稍後再試。');
    }
    let data;
    try{data=await response.json();}catch(error){
      if(error.name==='AbortError')throw error;
      throw new Error('服務回覆格式不完整，請稍後重試。');
    }
    return readChatCompletion(data);
  }finally{clearTimeout(timer);}
}

export function completionDiagnostics(data){
  const choice=data?.choices?.[0],message=choice?.message,usage=data?.usage;
  const reason=choice?.finish_reason;
  const reasoningTokens=count(usage?.completion_tokens_details?.reasoning_tokens);
  return {
    finishReason:typeof reason==='string'&&/^[a-z_]{1,40}$/.test(reason)?reason:(data?.error?'error':'unknown'),
    contentType:typeof message?.content==='string'?'text':Array.isArray(message?.content)?'text parts':'missing',
    outputTokens:count(usage?.completion_tokens),reasoningTokens,
    reasoningPresent:reasoningTokens>0||hasText(message?.reasoning)||hasText(message?.reasoning_content)||
      (Array.isArray(message?.reasoning_details)&&message.reasoning_details.length>0),
  };
}

export function readChatCompletion(data){
  const info=completionDiagnostics(data),message=data?.choices?.[0]?.message;
  let reply=typeof message?.content==='string'?message.content:'';
  if(Array.isArray(message?.content))reply=message.content
    .filter(part=>part&&['text','output_text'].includes(part.type)&&typeof part.text==='string')
    .map(part=>part.text).join('\n');
  if(!reply.trim()&&hasText(message?.refusal))reply=message.refusal;
  if(reply.trim()&&!data?.error)return {reply,usage:data?.usage,diagnostics:info};
  let text='服務供應商沒有回傳文字答案，請稍後重試。';
  if(data?.error||info.finishReason==='error')text='服務供應商未能完成回覆，請稍後重試。';
  else if(info.finishReason==='length')text=info.reasoningPresent?
    '模型在思考階段已達輸出上限，尚未產生答案。請重新傳送。':'模型已達輸出上限，未能產生可顯示的答案。請重新傳送。';
  else if(info.finishReason==='content_filter')text='服務供應商未能提供此問題的文字回覆，請改寫問題後再試。';
  else if(info.reasoningPresent)text='模型只回傳思考資料，沒有可顯示的答案，請重新傳送。';
  const error=new Error(text);error.completionDiagnostics=info;throw error;
}

export function formatCompletionDiagnostics(info){
  const number=value=>value===null?'未提供':value.toLocaleString();
  return '停止原因：'+info.finishReason+'；文字格式：'+info.contentType+
    '；總輸出：'+number(info.outputTokens)+' tokens；思考：'+number(info.reasoningTokens)+' tokens。';
}
