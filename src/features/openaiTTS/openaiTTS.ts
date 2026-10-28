import { config } from '@/utils/config';

export async function openaiTTS(
  message: string,
) {
  const apiKey = config("openai_tts_apikey");
  if (!apiKey) {
    throw new Error("Invalid OpenAI TTS API Key");
  }

  const baseUrl = config("openai_tts_url").trim().replace(/\/+$/, '');
  const endpoint = `${baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`}/audio/speech`;
  const safeMessage = (message: string) => message.split(apiKey).join('[REDACTED]').slice(0, 500);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      body: JSON.stringify({
        model: config("openai_tts_model"),
        input: message,
        voice: config("openai_tts_voice"),
        response_format: "mp3",
      }),
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Network request failed';
    throw new Error(`TTS request failed: ${safeMessage(detail)}`);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.error?.message ?? body?.message;
    const suffix = typeof detail === 'string' ? `: ${safeMessage(detail)}` : '';
    throw new Error(`TTS API Error (${res.status})${suffix}`);
  }

  return { audio: await res.arrayBuffer() };
}
