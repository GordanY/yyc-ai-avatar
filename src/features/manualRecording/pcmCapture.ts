import { buildUrl } from "@/utils/buildUrl";

export type PcmCapture = {
  stop: () => Promise<AudioBuffer>;
  cancel: () => void;
};

/** Keep microphone samples independently of the browser's container encoder. */
export async function startPcmCapture(
  stream: MediaStream,
): Promise<PcmCapture> {
  const context = new AudioContext();
  let source: MediaStreamAudioSourceNode | undefined;
  let node: AudioWorkletNode | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectStop: ((reason: Error) => void) | undefined;
  let closed = false;
  let chunks: Float32Array[] = [];
  const dispose = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    if (node) {
      node.port.onmessage = null;
      node.port.close();
      node.disconnect();
    }
    source?.disconnect();
    chunks = [];
    void context.close().catch(() => {});
  };
  try {
    // Resume promptly; do not wait for module loading before requesting it.
    void context.resume().catch(() => {});
    await context.audioWorklet.addModule(buildUrl("/manual-pcm-capture.js"));
    node = new AudioWorkletNode(context, "manual-pcm-capture", {
      channelCount: 1,
      channelCountMode: "explicit",
    });
    source = context.createMediaStreamSource(stream);
    source.connect(node);
    // The processor outputs silence, so the microphone is never monitored aloud.
    node.connect(context.destination);
    let finish: (() => void) | undefined;
    node.port.onmessage = ({ data }) => {
      if (data.samples instanceof Float32Array) chunks.push(data.samples);
      if (data.stopped) finish?.();
    };
    let stopping: Promise<AudioBuffer> | undefined;
    return {
      stop: () => {
        if (stopping) return stopping;
        stopping = new Promise<AudioBuffer>((resolve, reject) => {
          rejectStop = reject;
          if (closed) {
            reject(new Error("Microphone sample capture was cancelled."));
            return;
          }
          finish = () => {
            try {
              const length = chunks.reduce(
                (sum, chunk) => sum + chunk.length,
                0,
              );
              if (!length) {
                dispose();
                reject(
                  new Error(
                    "No microphone samples were captured. Please check your microphone input.",
                  ),
                );
                return;
              }
              const input = new AudioBuffer({
                length,
                numberOfChannels: 1,
                sampleRate: context.sampleRate,
              });
              const values = input.getChannelData(0);
              let offset = 0;
              for (const chunk of chunks) {
                values.set(chunk, offset);
                offset += chunk.length;
              }
              dispose();
              // Use the same band-limited resampling as the encoded recording path.
              const offline = new OfflineAudioContext(
                1,
                Math.max(1, Math.ceil(input.duration * 16000)),
                16000,
              );
              const playback = offline.createBufferSource();
              playback.buffer = input;
              playback.connect(offline.destination);
              playback.start();
              void offline.startRendering().then(resolve, reject);
            } catch (error) {
              dispose();
              reject(error);
            }
          };
          timer = setTimeout(() => {
            dispose();
            reject(
              new Error(
                "Microphone sample capture did not finish. Please try again.",
              ),
            );
          }, 2000);
          node!.port.postMessage({ stop: true });
        });
        return stopping;
      },
      cancel: () => {
        dispose();
        rejectStop?.(new Error("Microphone sample capture was cancelled."));
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
