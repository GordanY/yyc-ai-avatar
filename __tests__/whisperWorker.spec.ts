/** @jest-environment node */
import { jest, test, expect, afterEach } from '@jest/globals';

const mockPipeline = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock('@xenova/transformers', () => ({ pipeline: (...args: any[]) => mockPipeline(...args), env: {} }));
const originalSelf = globalThis.self;
afterEach(() => { Object.assign(globalThis, { self: originalSelf }); jest.resetModules(); mockPipeline.mockReset(); });

test('failed browser model initialization emits error and permits a successful explicit retry', async () => {
  let onMessage!: (event: { data: { audio: Float32Array } }) => Promise<void>;
  const postMessage = jest.fn();
  Object.assign(globalThis, { self: { addEventListener: (_: string, handler: typeof onMessage) => { onMessage = handler; }, postMessage } });
  const transcript = { text: 'Whole manual recording', chunks: [] };
  const transcribe = Object.assign(jest.fn(async () => transcript), {
    processor: { feature_extractor: { config: { chunk_length: 30 } } },
    model: { config: { max_source_positions: 1500 } },
  });
  mockPipeline.mockRejectedValueOnce(new Error('Model download failed')).mockResolvedValueOnce(transcribe);
  require('../src/workers/whisper.js');
  await onMessage({ data: { audio: new Float32Array(16000) } });
  expect(postMessage).toHaveBeenLastCalledWith({ status: 'error', task: 'automatic-speech-recognition', data: { message: 'Model download failed' } });
  await onMessage({ data: { audio: new Float32Array(16000) } });
  expect(mockPipeline).toHaveBeenCalledTimes(2);
  expect(postMessage).toHaveBeenLastCalledWith({ status: 'complete', task: 'automatic-speech-recognition', data: transcript });
  expect(transcribe).toHaveBeenCalledTimes(1);
});
