/** @jest-environment node */
import { test, expect, jest, afterEach } from '@jest/globals';
jest.mock('../src/utils/config', () => ({ config: (k: string) => ({ elevenlabs_apikey: 'test-key', elevenlabs_model: 'eleven_multilingual_v2' } as Record<string, string>)[k] }));
const { elevenlabs, characterAlignment } = require('../src/features/elevenlabs/elevenlabs') as typeof import('../src/features/elevenlabs/elevenlabs');
const fetchBefore = global.fetch;
afterEach(() => { global.fetch = fetchBefore; });
test('native character timestamps travel with the exact decoded audio bytes', async () => {
  global.fetch = jest.fn(async () => new Response(JSON.stringify({ audio_base64: 'AQID', alignment: { characters: ['a', 'e'], character_start_times_seconds: [.1, .4], character_end_times_seconds: [.3, .6] } }))) as any;
  const result = await elevenlabs('ae', 'voice/id', 'talk');
  expect(Array.from(new Uint8Array(result.audio))).toEqual([1, 2, 3]);
  expect(result.alignment?.marks[1]).toEqual({ text: 'e', start: .4, end: .6, kind: 'character' });
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('voice%2Fid/with-timestamps'), expect.anything());
});
test('malformed metadata is discarded without inventing timing', () => {
  expect(characterAlignment(null)).toBeUndefined();
  expect(characterAlignment({ characters: ['a'], character_start_times_seconds: [NaN], character_end_times_seconds: [1] })).toBeUndefined();
});
