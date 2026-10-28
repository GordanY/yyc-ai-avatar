/** Reveal visible tokens immediately while keeping split control tags and
 * private reasoning out of the transcript. Audio sentence parsing is separate. */
export class ReplyTextStream {
  private pending = '';
  private thinking = false;

  push(chunk: string, final = false): string {
    this.pending += chunk;
    let visible = '';
    while (this.pending) {
      if (this.pending.startsWith('<think>')) {
        this.thinking = true;
        this.pending = this.pending.slice(7);
        continue;
      }
      if (this.pending.startsWith('</think>')) {
        this.thinking = false;
        this.pending = this.pending.slice(8);
        continue;
      }
      if (['<think>', '</think>'].some(tag => tag.startsWith(this.pending))) {
        if (final) this.pending = '';
        break;
      }
      if (!this.thinking && (this.pending[0] === '[' || this.pending[0] === '*')) {
        const end = this.pending.indexOf(this.pending[0] === '[' ? ']' : '*', 1);
        if (end < 0) {
          if (final) this.pending = '';
          break;
        }
        this.pending = this.pending.slice(end + 1);
        continue;
      }
      if (!this.thinking) visible += this.pending[0];
      this.pending = this.pending.slice(1);
    }
    return visible;
  }
}
