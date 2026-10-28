import { PcmCapture, startPcmCapture } from './pcmCapture';

export type RecordingState = 'idle' | 'requesting' | 'recording' | 'processing';
export type RecordingEnvironment = {
  getUserMedia: () => Promise<MediaStream>;
  createRecorder: (stream: MediaStream) => MediaRecorder;
  decode: (blob: Blob) => Promise<AudioBuffer>;
  startPcmCapture?: (stream: MediaStream) => Promise<PcmCapture>;
};

/** Decode the complete container, including the last dataavailable chunk, then
 * resample/downmix once. Silence is deliberately retained in the input to STT. */
export async function decodeRecording(blob: Blob): Promise<AudioBuffer> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const frames = Math.max(1, Math.ceil(decoded.duration * 16000));
    const offline = new OfflineAudioContext(1, frames, 16000);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0);
    return await offline.startRendering();
  } finally {
    await context.close();
  }
}

function browserEnvironment(): RecordingEnvironment {
  return {
    getUserMedia: () => {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone recording requires a secure browser connection.');
      return navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    },
    createRecorder: stream => {
      if (typeof MediaRecorder === 'undefined') throw new Error('This browser does not support microphone recording.');
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      return new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    },
    decode: decodeRecording,
    startPcmCapture,
  };
}

/** No VAD, silence threshold, timer limit or automatic transcription boundary. */
export class ManualRecorder {
  public state: RecordingState = 'idle';
  private generation = 0;
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private completion?: { resolve: (value: AudioBuffer | null) => void; reject: (reason: unknown) => void };
  private explicitlyStopped = false;
  private pcmCapture?: PcmCapture;
  private pcmAudio?: Promise<AudioBuffer | null>;

  constructor(
    private onState: (state: RecordingState) => void,
    private onError: (error: Error) => void,
    private environment: RecordingEnvironment = browserEnvironment(),
  ) {}

  private setState(state: RecordingState) { this.state = state; this.onState(state); }
  private release() {
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = undefined;
  }
  private fail(reason: unknown) {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    this.pcmCapture?.cancel();
    this.pcmCapture = undefined;
    this.release();
    const completion = this.completion;
    this.completion = undefined;
    this.setState('idle');
    if (completion) completion.reject(error);
    else this.onError(error);
  }

  async start(): Promise<void> {
    if (this.state !== 'idle') return;
    const generation = ++this.generation;
    this.explicitlyStopped = false;
    this.chunks = [];
    this.setState('requesting');
    try {
      const stream = await this.environment.getUserMedia();
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      // Start the backup before recording, rather than trying to recapture
      // speech after discovering an empty or undecodable container at Stop.
      const pcmCapture = await this.environment.startPcmCapture?.(stream).catch(() => undefined);
      if (generation !== this.generation) { pcmCapture?.cancel(); return; }
      this.pcmCapture = pcmCapture;
      this.pcmAudio = undefined;
      const recorder = this.environment.createRecorder(stream);
      this.recorder = recorder;
      recorder.ondataavailable = event => {
        if (generation === this.generation && event.data.size > 0) this.chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (generation === this.generation) { this.detachAndStop(); this.fail(new Error('Microphone recording failed. Please try again.')); }
      };
      recorder.onstop = () => {
        if (generation !== this.generation) return;
        this.release();
        if (!this.explicitlyStopped) {
          this.fail(new Error('The microphone disconnected before Stop. No recording was submitted.'));
          return;
        }
        this.setState('processing');
        const blob = new Blob(this.chunks, { type: recorder.mimeType || this.chunks[0]?.type || 'audio/webm' });
        this.chunks = [];
        const pcmAudio = this.pcmAudio;
        void (async () => {
          try {
            let audio: AudioBuffer;
            try {
              if (!blob.size) throw new Error('The microphone returned an empty recording.');
              audio = await this.environment.decode(blob);
            } catch (error) {
              const backup = await pcmAudio;
              if (!backup) throw error;
              audio = backup;
            }
            if (generation !== this.generation) return;
            this.pcmCapture?.cancel();
            this.pcmCapture = undefined;
            this.pcmAudio = undefined;
            const completion = this.completion;
            this.completion = undefined;
            this.setState('idle');
            completion?.resolve(audio);
          } catch (error) { if (generation === this.generation) this.fail(error); }
        })();
      };
      // Periodic encoded chunks reduce browser buffering; they never trigger STT.
      recorder.start(1000);
      this.setState('recording');
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    }
  }

  stop(): Promise<AudioBuffer | null> {
    if (this.state !== 'recording' || !this.recorder) return Promise.resolve(null);
    this.explicitlyStopped = true;
    this.setState('processing');
    return new Promise((resolve, reject) => {
      this.completion = { resolve, reject };
      try {
        // Flush the worklet before releasing tracks; even the final partial
        // block belongs to this recording. Handle backup errors immediately.
        this.pcmAudio = this.pcmCapture?.stop().catch(() => null);
        this.recorder!.stop();
      }
      catch (error) { this.detachAndStop(); this.fail(error); }
    });
  }

  private detachAndStop() {
    const recorder = this.recorder;
    this.recorder = undefined;
    if (recorder) {
      recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null;
      if (recorder.state !== 'inactive') { try { recorder.stop(); } catch { /* already stopped */ } }
    }
  }

  cancel() {
    this.generation++;
    this.pcmCapture?.cancel();
    this.pcmCapture = undefined;
    this.pcmAudio = undefined;
    this.detachAndStop();
    this.release();
    this.chunks = [];
    const completion = this.completion;
    this.completion = undefined;
    completion?.resolve(null);
    this.setState('idle');
  }
}
