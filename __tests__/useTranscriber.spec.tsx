/** @jest-environment jsdom */
import { jest, test, expect, afterEach } from '@jest/globals';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import type { Transcriber } from '../src/hooks/useTranscriber';

let mockHandler: (event: MessageEvent) => void;
const mockChannel = { postMessage: jest.fn<(message: unknown) => void>() };
jest.mock('../src/hooks/useWorker', () => ({ useWorker: (_type: string, handler: typeof mockHandler) => { mockHandler = handler; return mockChannel; } }));
const { useTranscriber } = require('../src/hooks/useTranscriber') as typeof import('../src/hooks/useTranscriber');
let root: Root | undefined;
let latest!: Transcriber;
function Harness() { latest = useTranscriber(); return <div role="status">{latest.error || (latest.isBusy ? 'busy' : 'ready')}</div>; }
const audio = { numberOfChannels: 1, length: 16000, getChannelData: () => new Float32Array(16000) } as unknown as AudioBuffer;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => { await act(async () => root?.unmount()); document.body.innerHTML = ''; mockChannel.postMessage.mockReset(); });

test('postMessage rejection and browser model-load error both release busy/loading state for an explicit retry', async () => {
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => { root!.render(<Harness />); });
  mockChannel.postMessage.mockImplementationOnce(() => { throw new Error('Worker could not start'); });
  await act(async () => { await expect(latest.start(audio)).rejects.toThrow('Worker could not start'); });
  expect(latest.isBusy).toBe(false); expect(latest.isModelLoading).toBe(false); expect(latest.error).toBe('Worker could not start');
  await act(async () => { await latest.start(audio); });
  expect(latest.isBusy).toBe(true); expect(latest.error).toBeUndefined();
  await act(async () => { mockHandler(new MessageEvent('message', { data: { status: 'initiate' } })); });
  expect(latest.isModelLoading).toBe(true);
  Object.assign(window, { chatvrm_loading_progress: { 'other-download.onnx': 61 }, chatvrm_loading_progress_cnt: 0 });
  await act(async () => { mockHandler(new MessageEvent('message', { data: { status: 'progress', file: 'whisper-model.onnx', progress: 42 } })); });

  await act(async () => { mockHandler(new MessageEvent('message', { data: { status: 'error', data: { message: 'Model download failed' } } })); });
  expect(latest.isBusy).toBe(false); expect(latest.isModelLoading).toBe(false); expect(latest.output).toBeUndefined(); expect(latest.error).toBe('Model download failed');
  expect((window as any).chatvrm_loading_progress).toEqual({ 'other-download.onnx': 61 });
  await act(async () => { await latest.start(audio); });
  expect(latest.isBusy).toBe(true); expect(latest.error).toBeUndefined();
  await act(async () => { mockHandler(new MessageEvent('message', { data: { status: 'progress', file: 'whisper-model.onnx', progress: 57 } })); });
  await act(async () => { mockHandler(new MessageEvent('message', { data: { status: 'complete', data: { text: 'Recovered whole recording', chunks: [] } } })); });
  expect((window as any).chatvrm_loading_progress).toEqual({ 'other-download.onnx': 61 });
  expect(latest.isBusy).toBe(false); expect(latest.isModelLoading).toBe(false); expect(latest.output?.text).toBe('Recovered whole recording');
});
