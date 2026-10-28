import { LipSyncAnalyzeResult } from './lipSyncAnalyzeResult';
import { AudioEnvelope, createEnvelope } from '../avatarMotion/speechPlan';

export type PlaybackStart = { duration: number; envelope: AudioEnvelope; audibleStart: number };

/** AudioContext.currentTime is the single speech clock, including suspension. */
export class LipSync {
  public readonly audio: AudioContext;
  public readonly analyser: AnalyserNode;
  public readonly timeDomainData = new Float32Array(2048);
  private generation = 0;
  private source?: AudioBufferSourceNode;
  private settle?: (error?: unknown) => void;
  private startedAt = 0;
  private duration = 0;
  public isPlaying = false;
  private audibleAt = 0;
  private onAudible?: () => void;
  private marker?: AudioBufferSourceNode;
  private markerGain?: GainNode;
  private readonly onAudioStateChange = () => this.presentAudible();

  constructor(audio: AudioContext) {
    this.audio = audio;
    this.analyser = audio.createAnalyser();
    this.analyser.fftSize = this.timeDomainData.length;
    this.audio.addEventListener?.('statechange', this.onAudioStateChange);
  }

  get currentTime() { return this.isPlaying ? Math.min(this.duration, Math.max(0, this.audio.currentTime - this.startedAt)) : 0; }

  update(): LipSyncAnalyzeResult {
    if (!this.isPlaying || this.audio.state !== 'running') return { volume: 0 };
    this.presentAudible();
    this.analyser.getFloatTimeDomainData(this.timeDomainData);
    let squared = 0;
    for (const v of this.timeDomainData) squared += v * v;
    return { volume: Math.min(1, Math.max(0, (Math.sqrt(squared / this.timeDomainData.length) - .008) * 9)) };
  }

  private presentAudible(atAudioBoundary = false) {
    if (this.onAudible && this.isPlaying && this.audio.state === 'running' && (atAudioBoundary || this.currentTime >= this.audibleAt)) {
      const callback = this.onAudible; this.onAudible = undefined; callback();
    }
  }

  private clearMarker() {
    const marker = this.marker; this.marker = undefined;
    if (marker) { marker.onended = null; try { marker.stop(); } catch {} marker.disconnect(); }
    this.markerGain?.disconnect(); this.markerGain = undefined;
  }

  stop() {
    this.generation++;
    this.clearMarker();
    const source = this.source;
    this.source = undefined;
    this.isPlaying = false;
    this.onAudible = undefined;
    if (source) {
      source.onended = null;
      try { source.stop(); } catch { /* already ended */ }
      source.disconnect();
    }
    const settle = this.settle;
    this.settle = undefined;
    settle?.();
  }

  playFromArrayBuffer(buffer: ArrayBuffer, onEnded?: () => void, onStart?: (start: PlaybackStart) => void, onAudible?: () => void): Promise<void> {
    this.stop();
    const generation = this.generation;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        if (generation === this.generation) {
          this.isPlaying = false;
          this.onAudible = undefined;
          this.clearMarker();
          this.source?.disconnect();
          this.source = undefined;
          this.settle = undefined;
        }
        onEnded?.();
        error ? reject(error) : resolve();
      };
      this.settle = finish;
      void (async () => {
        try {
          // decodeAudioData can detach its argument; preserve callers' buffers.
          const decoded = await this.audio.decodeAudioData(buffer.slice(0));
          if (generation !== this.generation) return;
          await this.audio.resume();
          if (generation !== this.generation) return;
          const source = this.audio.createBufferSource();
          source.buffer = decoded;
          source.connect(this.audio.destination);
          source.connect(this.analyser);
          source.onended = () => {
            if (generation === this.generation) this.presentAudible(true);
            finish();
          };
          this.source = source;
          this.duration = decoded.duration;
          const envelope = createEnvelope(decoded);
          const peak = envelope.levels.reduce((a, b) => Math.max(a, b), 0);
          const firstVoice = envelope.levels.findIndex(level => level > Math.max(.002, peak * .04));
          this.audibleAt = firstVoice < 0 ? 0 : firstVoice * envelope.step;
          this.onAudible = onAudible;
          this.startedAt = this.audio.currentTime;
          source.start(this.startedAt);
          this.isPlaying = true;
          if (onAudible && this.audibleAt > 0) {
            // A silent scheduled source ends at the audible boundary. Unlike a
            // wall timer or render-frame poll, this follows AudioContext pause
            // and also delivers captions when rendering is throttled.
            const marker = this.audio.createBufferSource(), gain = this.audio.createGain();
            gain.gain.value = 0; marker.buffer = decoded;
            marker.connect(gain); gain.connect(this.audio.destination);
            this.marker = marker; this.markerGain = gain;
            marker.onended = () => {
              marker.disconnect(); gain.disconnect();
              if (this.marker === marker) { this.marker = undefined; this.markerGain = undefined; }
              if (generation === this.generation) this.presentAudible(true);
            };
            marker.start(this.startedAt, 0, this.audibleAt);
          }
          onStart?.({ duration: decoded.duration, envelope, audibleStart: this.audibleAt });
          this.presentAudible();
        } catch (error) {
          if (generation === this.generation) { try { this.source?.stop(); } catch {} finish(error); }
        }
      })();
    });
  }

  async playFromURL(url: string, onEnded?: () => void) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Audio request failed (' + response.status + ')');
    await this.playFromArrayBuffer(await response.arrayBuffer(), onEnded);
  }

  dispose() { this.stop(); this.audio.removeEventListener?.('statechange', this.onAudioStateChange); void this.audio.close().catch(() => {}); }
}
