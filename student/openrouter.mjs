export function normalizeApiKey(value) {
  let key=String(value??'').replace(/\p{Cf}/gu,'').trim();
  key=key.replace(/^(?:export\s+)?OPENROUTER_API_KEY\s*=\s*/i,'')
    .replace(/^Authorization\s*:\s*/i,'').replace(/^Bearer\s+/i,'')
    .replace(/^["'`]+|["'`]+$/g,'').replace(/\s+/gu,'');
  // Let OpenRouter authenticate opaque keys; don't enforce a guessed prefix/length.
  if(!key)throw new Error('請先貼上 OpenRouter API 金鑰。');
  if(/[^\x21-\x7e]/.test(key))throw new Error('金鑰包含無法傳送的字元，請從 OpenRouter 重新複製。');
  return key;
}

export async function validateApiKey(key,signal) {
  let response;
  try{
    response=await fetch('https://openrouter.ai/api/v1/key',{
      headers:{Authorization:'Bearer '+key},signal,cache:'no-store',credentials:'omit'
    });
  }catch(error){
    if(error.name==='AbortError')throw error;
    throw new Error('未能連接 OpenRouter 驗證金鑰。請檢查網絡後重試。');
  }
  if(!response.ok){
    const messages={401:'OpenRouter 不接受此金鑰。請確認金鑰完整、未過期，且來自 OpenRouter。',
      403:'此金鑰沒有使用權限，請檢查 OpenRouter 的金鑰設定。',429:'OpenRouter 請求太頻密，請稍後重試。'};
    throw new Error(messages[response.status]||'OpenRouter 暫時未能驗證金鑰，請稍後重試。');
  }
  const result=await response.json();
  if(!result.data||typeof result.data!=='object')throw new Error('未收到有效的金鑰驗證結果，請重試。');
  if(result.data.is_management_key||result.data.is_provisioning_key)throw new Error('這是管理用途金鑰，請改用可供聊天的 OpenRouter API 金鑰。');
}
