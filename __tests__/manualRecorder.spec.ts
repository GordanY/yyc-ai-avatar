/** @jest-environment node */
import { jest, test, expect } from '@jest/globals';
import { ManualRecorder, RecordingEnvironment, RecordingState } from '../src/features/manualRecording/manualRecorder';

class FakeRecorder {
  state = 'inactive';
  mimeType = 'audio/test';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  stopCount = 0;
  start() { this.state = 'recording'; }
  emit(text: string) { this.ondataavailable?.({ data: new Blob([text]) }); }
  stop() {
    this.stopCount++; this.state = 'inactive';
    queueMicrotask(() => { this.emit('|final-spoken-word'); this.onstop?.(); });
  }
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const audio = { sampleRate: 16000, numberOfChannels: 1, duration: 12, length: 192000 } as AudioBuffer;
function setup() {
  const states: RecordingState[] = [], errors: Error[] = [];
  const track = { stop: jest.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const recorders: FakeRecorder[] = [];
  const decode = jest.fn(async (_blob: Blob) => audio);
  const environment: RecordingEnvironment = {
    getUserMedia: jest.fn(async () => stream),
    createRecorder: jest.fn(() => { const recorder = new FakeRecorder(); recorders.push(recorder); return recorder as unknown as MediaRecorder; }),
    decode,
  };
  return { recorder: new ManualRecorder(s => states.push(s), e => errors.push(e), environment), states, errors, track, stream, recorders, decode, environment };
}

test('keeps long pauses and submits exactly once only after explicit Stop, including final dataavailable', async () => {
  const f = setup(); await f.recorder.start();
  f.recorders[0].emit('first-words');
  // No timeout or VAD boundary exists; arbitrary pause chunks remain buffered.
  for (let i = 0; i < 90; i++) f.recorders[0].emit('|silence');
  f.recorders[0].emit('|more-speech');
  expect(f.recorder.state).toBe('recording'); expect(f.decode).not.toHaveBeenCalled();
  expect(f.track.stop).not.toHaveBeenCalled();
  const result = await f.recorder.stop();
  expect(result).toBe(audio); expect(f.decode).toHaveBeenCalledTimes(1);
  const container = f.decode.mock.calls[0][0];
  expect(await container.text()).toBe('first-words' + '|silence'.repeat(90) + '|more-speech|final-spoken-word');
  expect(f.track.stop).toHaveBeenCalledTimes(1);
  expect(f.states).toEqual(['requesting', 'recording', 'processing', 'processing', 'idle']);
});

test('repeat recordings contain only their own chunks and duplicate Stop is harmless', async () => {
  const f = setup(); await f.recorder.start(); f.recorders[0].emit('one');
  const first = f.recorder.stop(); await expect(f.recorder.stop()).resolves.toBeNull(); await first;
  await f.recorder.start(); f.recorders[1].emit('two'); await f.recorder.stop();
  expect(f.recorders.map(r => r.stopCount)).toEqual([1, 1]);
  expect(await f.decode.mock.calls[1][0].text()).toBe('two|final-spoken-word');
});

test('cancellation releases a permission request that resolves late without starting capture', async () => {
  const f = setup(); let grant!: (stream: MediaStream) => void;
  f.environment.getUserMedia = jest.fn(() => new Promise<MediaStream>(resolve => { grant = resolve; }));
  const starting = f.recorder.start(); f.recorder.cancel(); grant(f.stream); await starting;
  expect(f.environment.createRecorder).not.toHaveBeenCalled(); expect(f.track.stop).toHaveBeenCalledTimes(1);
  expect(f.recorder.state).toBe('idle'); expect(f.decode).not.toHaveBeenCalled();
});

test('cancel during decoding resolves the pending Stop without delivering late audio', async () => {
  const f = setup(); let finishDecode!: (value: AudioBuffer) => void;
  f.environment.decode = jest.fn(() => new Promise<AudioBuffer>(resolve => { finishDecode = resolve; }));
  await f.recorder.start(); const stopping = f.recorder.stop(); await tick();
  f.recorder.cancel(); await expect(stopping).resolves.toBeNull(); finishDecode(audio); await tick();
  expect(f.recorder.state).toBe('idle'); expect(f.errors).toEqual([]);
});

test('an unexpected browser/device stop never submits a recording', async () => {
  const f = setup(); await f.recorder.start(); f.recorders[0].emit('partial'); f.recorders[0].onstop?.();
  expect(f.decode).not.toHaveBeenCalled(); expect(f.errors[0].message).toContain('No recording was submitted');
  expect(f.recorder.state).toBe('idle'); expect(f.track.stop).toHaveBeenCalled();
});

test('permission denial is recoverable and reports an error', async () => {
  const f = setup(); f.environment.getUserMedia = jest.fn<() => Promise<MediaStream>>().mockRejectedValueOnce(new Error('Permission denied')).mockResolvedValue(f.stream);
  await f.recorder.start(); expect(f.errors[0].message).toBe('Permission denied'); expect(f.recorder.state).toBe('idle');
  await f.recorder.start(); expect(f.recorder.state).toBe('recording'); f.recorder.cancel();
});

test('recovers the full PCM capture when the browser encoder returns empty audio', async () => {
  const f = setup();
  const capture = { stop: jest.fn(async () => audio), cancel: jest.fn() };
  Object.assign(f.environment, { startPcmCapture: jest.fn(async () => capture) });
  await f.recorder.start();
  f.recorders[0].emit = () => {};
  await expect(f.recorder.stop()).resolves.toBe(audio);
  expect(capture.stop).toHaveBeenCalledTimes(1);
  expect(f.decode).not.toHaveBeenCalled();
  expect(f.errors).toEqual([]);
});

test('recovers undecodable containers with the same complete PCM backup', async () => {
  const f = setup();
  const capture = { stop: jest.fn(async () => audio), cancel: jest.fn() };
  Object.assign(f.environment, { startPcmCapture: jest.fn(async () => capture) });
  f.decode.mockRejectedValueOnce(new Error('Unsupported audio container'));
  await f.recorder.start();
  await expect(f.recorder.stop()).resolves.toBe(audio);
  expect(f.decode).toHaveBeenCalledTimes(1);
  expect(capture.cancel).toHaveBeenCalled();
});

test('continues normal recording if PCM backup cannot start', async () => {
  const f = setup();
  Object.assign(f.environment, { startPcmCapture: jest.fn(async () => { throw new Error('Worklet unavailable'); }) });
  await f.recorder.start();
  await expect(f.recorder.stop()).resolves.toBe(audio);
  expect(f.decode).toHaveBeenCalledTimes(1);
});

test('cancels a PCM backup that finishes starting after cancellation', async () => {
  const f = setup();
  let finish!: (capture: { stop: () => Promise<AudioBuffer>; cancel: () => void }) => void;
  const capture = { stop: jest.fn(async () => audio), cancel: jest.fn() };
  Object.assign(f.environment, { startPcmCapture: jest.fn(() => new Promise(resolve => { finish = resolve; })) });
  const starting = f.recorder.start(); await tick();
  f.recorder.cancel(); finish(capture); await starting;
  expect(capture.cancel).toHaveBeenCalledTimes(1);
  expect(capture.stop).not.toHaveBeenCalled();
  expect(f.track.stop).toHaveBeenCalledTimes(1);
  expect(f.environment.createRecorder).not.toHaveBeenCalled();
});

test('cancel during PCM recovery resolves Stop without delivering late samples', async () => {
  const f = setup();
  let rejectBackup!: (reason: Error) => void;
  const capture = {
    stop: jest.fn(() => new Promise<AudioBuffer>((_, reject) => { rejectBackup = reject; })),
    cancel: jest.fn(() => rejectBackup(new Error('Cancelled'))),
  };
  Object.assign(f.environment, { startPcmCapture: jest.fn(async () => capture) });
  await f.recorder.start(); f.recorders[0].emit = () => {};
  const stopping = f.recorder.stop(); await tick();
  f.recorder.cancel(); await expect(stopping).resolves.toBeNull(); await tick();
  expect(f.errors).toEqual([]); expect(f.recorder.state).toBe('idle');
});
