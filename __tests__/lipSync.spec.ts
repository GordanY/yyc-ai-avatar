/** @jest-environment node */
import { test, expect, jest } from '@jest/globals';
import { LipSync } from '../src/features/lipSync/lipSync';
function fake() {
  const sources: any[] = [];
  const decoded = { duration: 2, sampleRate: 100, length: 200, numberOfChannels: 1, getChannelData: () => new Float32Array(200).fill(.1) };
  const context: any = { currentTime: 10, state: 'running', destination: {},
    createGain: () => ({ gain: { value: 1 }, connect: jest.fn(), disconnect: jest.fn() }),
    createAnalyser: () => ({ fftSize: 0, getFloatTimeDomainData: (a: Float32Array) => a.fill(.1) }),
    decodeAudioData: jest.fn(async () => decoded), resume: jest.fn(async () => {}), close: jest.fn(async () => {}),
    createBufferSource: () => { const s: any = { connect: jest.fn(), disconnect: jest.fn(), start: jest.fn(), stop: jest.fn(), onended: null }; sources.push(s); return s; },
  };
  return { context, sources, decoded, sync: new LipSync(context) };
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

test('playback begins only after decode/resume; time follows the audio clock', async () => {
  const { sync, context, sources } = fake(); const start = jest.fn(); const end = jest.fn();
  const done = sync.playFromArrayBuffer(new ArrayBuffer(10), end, start);
  expect(start).not.toHaveBeenCalled(); await flush();
  expect(start).toHaveBeenCalledTimes(1); expect(context.resume).toHaveBeenCalled();
  context.currentTime = 10.6; expect(sync.currentTime).toBeCloseTo(.6);
  expect(sync.update().volume).toBeGreaterThan(.5);
  sources[0].onended(); await done;
  expect(sync.isPlaying).toBe(false); expect(end).toHaveBeenCalledTimes(1);
});

test('stop settles a pending decode immediately and prevents stale playback', async () => {
  const { sync, context, sources, decoded } = fake(); let decode!: (b: any) => void;
  context.decodeAudioData.mockImplementation(() => new Promise(r => decode = r));
  const start = jest.fn(); const done = sync.playFromArrayBuffer(new ArrayBuffer(2), undefined, start);
  sync.stop(); await done; decode(decoded); await flush();
  expect(start).not.toHaveBeenCalled(); expect(sources).toHaveLength(0);
  expect(sync.update().volume).toBe(0);
});

test('interruption stops/disconnects old audio and its late ended event cannot end new speech', async () => {
  const { sync, sources } = fake(); const oldEnd = jest.fn();
  const first = sync.playFromArrayBuffer(new ArrayBuffer(2), oldEnd); await flush();
  const staleEnded = sources[0].onended;
  const second = sync.playFromArrayBuffer(new ArrayBuffer(3)); await flush(); await first;
  expect(sources[0].stop).toHaveBeenCalledTimes(1); expect(sources[0].disconnect).toHaveBeenCalled();
  staleEnded(); expect(sync.isPlaying).toBe(true); expect(oldEnd).toHaveBeenCalledTimes(1);
  sources[1].onended(); await second;
});

test('decode failure rejects cleanly instead of leaving the speaking queue hung', async () => {
  const { sync, context } = fake(); context.decodeAudioData.mockRejectedValue(new Error('bad audio'));
  await expect(sync.playFromArrayBuffer(new ArrayBuffer(2))).rejects.toThrow('bad audio');
  expect(sync.isPlaying).toBe(false);
});

test('caption cue waits for first audible samples and uses an audio-clock marker without render updates', async () => {
  const {sync,context,sources,decoded}=fake();decoded.getChannelData=()=>Float32Array.from({length:200},(_,i)=>i<50?0:.1);
  const audible=jest.fn(),started=jest.fn();const done=sync.playFromArrayBuffer(new ArrayBuffer(2),undefined,started,audible);await flush();
  expect((started.mock.calls[0][0] as {audibleStart:number}).audibleStart).toBeCloseTo(.5);expect(audible).not.toHaveBeenCalled();
  expect(sources[1].start).toHaveBeenCalledWith(10,0,.5);
  context.currentTime=10.5;sources[1].onended();expect(audible).toHaveBeenCalledTimes(1);
  sync.update();expect(audible).toHaveBeenCalledTimes(1);sources[0].onended();await done;
});
test('cancel before the first audible sample removes pending caption cues', async () => {
  const {sync,context,sources,decoded}=fake();decoded.getChannelData=()=>Float32Array.from({length:200},(_,i)=>i<100?0:.1);
  const audible=jest.fn();const done=sync.playFromArrayBuffer(new ArrayBuffer(2),undefined,undefined,audible);await flush();
  const lateMarker=sources[1].onended;sync.stop();await done;context.currentTime=12;lateMarker();sync.update();
  expect(audible).not.toHaveBeenCalled();expect(sources[1].stop).toHaveBeenCalled();
});
test('suspended audio does not reveal text or report stale mouth energy', async () => {
  const {sync,context,sources,decoded}=fake();decoded.getChannelData=()=>Float32Array.from({length:200},(_,i)=>i<50?0:.1);
  const audible=jest.fn();const done=sync.playFromArrayBuffer(new ArrayBuffer(2),undefined,undefined,audible);await flush();
  context.currentTime=10.4;context.state='suspended';expect(sync.update().volume).toBe(0);expect(audible).not.toHaveBeenCalled();
  context.state='running';context.currentTime=10.5;sync.update();expect(audible).toHaveBeenCalledTimes(1);sources[0].onended();await done;
});
