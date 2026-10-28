import { TalkStyle } from "@/features/chat/messages";
import { SpeechAlignment, SpeechAudio } from '../avatarMotion/speechPlan';
import { config } from '@/utils/config';

export async function elevenlabs(
  message: string,
  voiceId: string,
  style: TalkStyle,
): Promise<SpeechAudio> {
  const apiKey = config("elevenlabs_apikey");
  if (! apiKey) {
    throw new Error("Invalid ElevenLabs API Key");
  }

  // Request body
  const body = {
    text: message,
    model_id: config("elevenlabs_model"),
    voice_settings: {
      stability: 0,
      similarity_boost: 0,
      style: 0,
      use_speaker_boost: true
    }
  };

  const elevenlabsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "xi-api-key": apiKey,
    },
  });
  if (! elevenlabsRes.ok) {
    throw new Error(`ElevenLabs API Error (${elevenlabsRes.status})`);
  }
  const data = await elevenlabsRes.json();
  if (typeof data.audio_base64 !== 'string' || !data.audio_base64) throw new Error('ElevenLabs returned no audio');
  const bytes = Uint8Array.from(atob(data.audio_base64), c => c.charCodeAt(0));
  const alignment = characterAlignment(data.normalized_alignment) ?? characterAlignment(data.alignment);
  return { audio: bytes.buffer, ...(alignment ? { alignment } : {}) };
}

export function characterAlignment(value: unknown): SpeechAlignment | undefined {
  const a = value as { characters?: unknown[]; character_start_times_seconds?: number[]; character_end_times_seconds?: number[] } | null;
  if (!Array.isArray(a?.characters) || !Array.isArray(a?.character_start_times_seconds) || !Array.isArray(a?.character_end_times_seconds)) return undefined;
  const marks: SpeechAlignment['marks'] = [];
  for (let i = 0; i < a.characters.length; i++) {
    const text = a.characters[i], start = a.character_start_times_seconds[i], end = a.character_end_times_seconds[i];
    if (typeof text === 'string' && Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start) marks.push({ text, start, end, kind: 'character' });
  }
  return marks.length ? { marks, source: 'ElevenLabs character alignment' } : undefined;
}
