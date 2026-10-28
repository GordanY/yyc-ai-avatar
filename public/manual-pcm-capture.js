/* Keep pauses and flush the final partial block only on explicit Stop. */
class ManualPcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Float32Array(4096);
    this.offset = 0;
    this.stopped = false;
    this.port.onmessage = ({ data }) => {
      if (data.stop) {
        this.stopped = true;
        this.flush();
        this.port.postMessage({ stopped: true });
      }
    };
  }
  flush() {
    if (!this.offset) return;
    const samples = this.samples.slice(0, this.offset);
    this.port.postMessage({ samples }, [samples.buffer]);
    this.offset = 0;
  }
  process(inputs) {
    if (this.stopped) return false;
    const input = inputs[0]?.[0];
    if (input) {
      for (let i = 0; i < input.length; i++) {
        this.samples[this.offset++] = input[i];
        if (this.offset === this.samples.length) this.flush();
      }
    }
    return true;
  }
}
registerProcessor("manual-pcm-capture", ManualPcmCapture);
