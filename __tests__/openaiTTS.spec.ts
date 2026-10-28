/** @jest-environment node */
import { beforeEach, afterEach, expect, jest, test } from '@jest/globals';

const mockSettings: Record<string, string> = {};
jest.mock('../src/utils/config', () => ({
  config: (key: string) => mockSettings[key],
}));
const { openaiTTS } = require('../src/features/openaiTTS/openaiTTS') as typeof import('../src/features/openaiTTS/openaiTTS');

const originalFetch = global.fetch;
beforeEach(() => {
  Object.assign(mockSettings, {
    openai_tts_apikey: 'test-secret',
    openai_tts_url: 'https://openrouter.ai/api',
    openai_tts_model: 'minimax/speech-2.8-hd',
    openai_tts_voice: 'Cantonese_ProfessionalHost（M)',
  });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

test('synthesizes Cantonese with the exact voice ID and explicit MP3 output', async () => {
  const audio = new Uint8Array([0x49, 0x44, 0x33]);
  global.fetch = jest.fn(async (_url: any, options: any) => {
    const body = JSON.parse(options.body);
    // Reproduce the provider rejection rather than accepting an invalid request.
    if (body.response_format !== 'mp3') {
      return new Response(JSON.stringify({ error: { message: 'MiniMax only supports mp3' } }), { status: 400 });
    }
    expect(body.voice).toBe('Cantonese_ProfessionalHost（M)');
    expect(body.model).toBe('minimax/speech-2.8-hd');
    expect(body.input).toBe('你好，歡迎你！');
    return new Response(audio, { headers: { 'Content-Type': 'audio/mpeg' } });
  }) as any;
  await expect(openaiTTS('你好，歡迎你！')).resolves.toEqual({ audio: audio.buffer });
});

test.each([
  'https://openrouter.ai/api',
  'https://openrouter.ai/api/',
  'https://openrouter.ai/api/v1',
  'https://openrouter.ai/api/v1/',
])('uses one v1 segment for base URL %s', async (url) => {
  mockSettings.openai_tts_url = url;
  global.fetch = jest.fn(async () => new Response(new Uint8Array([1]))) as any;
  await openaiTTS('你好');
  expect(global.fetch).toHaveBeenCalledWith('https://openrouter.ai/api/v1/audio/speech', expect.anything());
});

test('preserves HTTP status and the provider error without exposing the API key', async () => {
  global.fetch = jest.fn(async () => new Response(JSON.stringify({
    error: { message: 'Unknown voice; credential test-secret' },
  }), { status: 400 })) as any;
  const error = await openaiTTS('你好').catch((reason: Error) => reason);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain('400');
  expect((error as Error).message).toContain('Unknown voice');
  expect((error as Error).message).not.toContain('test-secret');
});

test('reports HTTP status when the provider returns a non-JSON error', async () => {
  global.fetch = jest.fn(async () => new Response('Bad Gateway', { status: 502 })) as any;
  await expect(openaiTTS('你好')).rejects.toThrow('502');
});

test('keeps network errors distinguishable from HTTP failures', async () => {
  global.fetch = jest.fn(async () => { throw new Error('Failed to fetch'); }) as any;
  await expect(openaiTTS('你好')).rejects.toThrow('Failed to fetch');
});
