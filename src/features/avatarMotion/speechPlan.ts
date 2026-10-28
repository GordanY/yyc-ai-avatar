/** Seconds are relative to the first sample of the decoded audio. */
export type SpeechMark = { text: string; start: number; end: number; kind: 'word' | 'character' | 'phoneme' | 'viseme' };
export type SpeechAlignment = { marks: SpeechMark[]; source: string };
export type SpeechAudio = { audio: ArrayBuffer; alignment?: SpeechAlignment };
export type AudioEnvelope = { step: number; levels: number[] };
export type Vowel = 'aa' | 'ih' | 'ou' | 'ee' | 'oh';
export type GestureIntent = 'greeting' | 'agreement' | 'explanation' | 'emphasis';
export type GestureCue = { intent: GestureIntent; start: number; stroke: number; end: number; strength: number };
export type SpeechPlan = {
  duration: number; gestures: GestureCue[];
  visemes: { start: number; end: number; vowel: Vowel }[];
  timing: string; expression: string;
};

const intents: [GestureIntent, RegExp][] = [
  ['greeting', /\b(hello|hi|welcome|greetings|good morning|good afternoon)\b|你好|您好|大家好|歡迎|早晨|午安/iu],
  ['agreement', /\b(yes|agree|correct|exactly|certainly|absolutely)\b|同意|冇錯|沒錯|正確|係呀|係啊|好呀/iu],
  ['emphasis', /\b(important|remember|must|especially|essential|please note)\b|重要|記住|留意|關鍵|一定|特別/iu],
  ['explanation', /\b(because|means|example|explain|therefore|first|second|consider)\b|因為|例如|即係|所以|首先|其次|解釋|舉例/iu],
];
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export function createEnvelope(buffer: AudioBuffer): AudioEnvelope {
  const step = .02, samples = Math.max(1, Math.round(buffer.sampleRate * step));
  const levels = new Array(Math.ceil(buffer.length / samples)).fill(0);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let frame = 0; frame < levels.length; frame++) {
      let sum = 0, count = 0;
      for (let i = frame * samples; i < Math.min(data.length, (frame + 1) * samples); i++) { sum += data[i] * data[i]; count++; }
      levels[frame] = Math.max(levels[frame], Math.sqrt(sum / Math.max(1, count)));
    }
  }
  return { step, levels };
}

/** Fallback places text over audible regions. It is not forced phoneme alignment. */
function estimatedMarks(text: string, duration: number, envelope?: AudioEnvelope): SpeechMark[] {
  const tokens = text.match(/[A-Za-zÀ-ž]+(?:['’-][A-Za-zÀ-ž]+)*|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[^\s]/gu) ?? [];
  const weights = tokens.map(t => /^[\p{L}\p{N}]/u.test(t) ? Math.max(1, t.match(/[aeiouy]+/gi)?.length ?? (t.length > 1 ? t.length / 3 : 1)) : .35);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const levels = envelope?.levels ?? [];
  const peak = levels.reduce((a, b) => Math.max(a, b), 0);
  const threshold = Math.max(.008, peak * .07);
  const active = levels.map((rms, i) => rms > threshold ? i : -1).filter(i => i >= 0);
  const timeAt = (fraction: number) => {
    if (!active.length || !envelope) return fraction * duration;
    if (fraction >= 1) return Math.min(duration, (active[active.length - 1] + 1) * envelope.step);
    return Math.min(duration, active[Math.floor(fraction * active.length)] * envelope.step);
  };
  let cursor = 0;
  return tokens.map((token, i) => {
    const start = timeAt(cursor / total); cursor += weights[i];
    return { text: token, start, end: Math.max(start, timeAt(cursor / total)), kind: 'word' };
  });
}

function vowelFor(mark: SpeechMark): Vowel | undefined {
  const value = mark.text.toLowerCase().replace(/[ˈˌːˑ0-9]/g, '');
  if (mark.kind === 'viseme' && ['aa', 'ih', 'ou', 'ee', 'oh'].includes(value)) return value as Vowel;
  if (mark.kind === 'phoneme') {
    if (/^(a|ɑ|æ|ʌ|ah|aa|ae)$/.test(value)) return 'aa';
    if (/^(i|ɪ|ih|iy|j)$/.test(value)) return 'ih';
    if (/^(u|ʊ|uw|uh|w)$/.test(value)) return 'ou';
    if (/^(e|ɛ|eh|ey)$/.test(value)) return 'ee';
    if (/^(o|ɔ|ə|ow|ao|er)$/.test(value)) return 'oh';
    return undefined;
  }
  // Orthographic approximation only. Han characters are deliberately not
  // presented as phonemes: without pronunciation metadata they use jaw energy.
  if (/ou|oo|u/.test(value)) return 'ou';
  if (/ee|ea|e/.test(value)) return 'ee';
  if (/i|y/.test(value)) return 'ih';
  if (/o/.test(value)) return 'oh';
  if (/a/.test(value)) return 'aa';
}

export function buildSpeechPlan(text: string, duration: number, alignment?: SpeechAlignment, envelope?: AudioEnvelope): SpeechPlan {
  duration = Math.max(0, duration);
  const provided = alignment?.marks.filter(m => Number.isFinite(m.start) && Number.isFinite(m.end) && m.start >= 0 && m.end > m.start && m.start < duration)
    .map(m => ({ ...m, end: Math.min(duration, m.end) })).sort((a, b) => a.start - b.start);
  const marks = provided?.length ? provided : estimatedMarks(text, duration, envelope);
  const speechText = marks.map(m => m.text).join('');
  // Locate semantic cues in the timed transcript, so greetings/agreements do
  // not turn into random waves just because the audio is loud.
  const gestures: GestureCue[] = [];
  let offset = 0, lastStroke = -10;
  for (const phrase of text.match(/[^.!?。！？;；,，]+[.!?。！？;；,，]?/gu) ?? []) {
    const intent = intents.find(([kind, pattern]) => {
      const hit = phrase.match(pattern);
      if (!hit) return false;
      const prefix = phrase.slice(0, hit.index ?? 0);
      if (kind === 'greeting' && /[\p{L}\p{N}]/u.test(prefix)) return false;
      if (/\b(?:not(?!\s+only)|never|\w+n't|do not)\s+(?:\w+\s+){0,2}$/iu.test(prefix) || /唔好|不要|唔係|不是|並非|不太|唔算/u.test(prefix.slice(-10))) return false;
      return true;
    });
    const match = intent && phrase.match(intent[1]);
    const anchor = offset + (match?.index ?? 0);
    const fraction = clamp(anchor / Math.max(1, text.length), 0, 1);
    // Word/character metadata may normalize punctuation or spacing. Find the
    // semantic word when possible; fall back to transcript progress, not timers.
    let mark = marks[Math.min(marks.length - 1, Math.floor(fraction * marks.length))];
    if (match) {
      const token = match[0].toLowerCase();
      const alternatives = intent ? Array.from(phrase.matchAll(new RegExp(intent[1].source, intent[1].flags + 'g')), m => m[0].toLowerCase()) : [token];
      const direct = marks.find(m => alternatives.some(word => m.text.toLowerCase().includes(word)) && m.start >= lastStroke + 1.5);
      if (direct) mark = direct;
      else if (speechText) {
        const found = speechText.toLowerCase().indexOf(token, Math.floor(fraction * speechText.length));
        if (found >= 0) {
          let chars = 0;
          mark = marks.find(m => { chars += m.text.length; return chars > found; }) ?? mark;
        }
      }
    }
    if (intent && mark && duration > .45) {
      const stroke = clamp(mark.start + Math.min(.22, (mark.end - mark.start) * .5), .28, Math.max(.28, duration - .15));
      if (stroke - lastStroke >= 1.5) {
        gestures.push({ intent: intent[0], start: Math.max(0, stroke - .32), stroke, end: Math.min(duration + .25, stroke + (intent[0] === 'greeting' ? 1.15 : .85)), strength: intent[0] === 'emphasis' ? .85 : 1 });
        lastStroke = stroke;
      }
    }
    offset += phrase.length;
  }
  // School introductions often contain none of the explicit intent keywords.
  // Fill quiet gesture gaps with presenter beats anchored to spoken marks,
  // preserving semantic cues and avoiding long pauses in the audio.
  const presenterIntents: GestureIntent[] = ['explanation', 'agreement', 'emphasis'];
  let beat = Array.from(text).reduce((sum, char) => sum + char.codePointAt(0)!, 0) % presenterIntents.length;
  const negated = /\b(?:not|never|\w+n't)\b|唔好|不要|唔係|不是|並非|不太|唔算/iu.test(text);
  const audibleThreshold = Math.max(.008, (envelope?.levels.reduce((peak, level) => Math.max(peak, level), 0) ?? 0) * .07);
  for (let target = .65; target < duration - .4; target += 2.6) {
    const mark = marks.find(m => m.end >= target && /[\p{L}\p{N}]/u.test(m.text));
    if (!mark) continue;
    const stroke = Math.max(target, mark.start) + Math.min(.15, (mark.end - mark.start) * .5);
    if (envelope && (envelope.levels[Math.floor(stroke / envelope.step)] ?? 0) <= audibleThreshold) continue;
    if (stroke > duration - .25 || gestures.some(cue => Math.abs(cue.stroke - stroke) < 1.8)) continue;
    let intent = presenterIntents[beat++ % presenterIntents.length];
    if (negated && intent === 'emphasis') intent = 'explanation';
    gestures.push({ intent, start: Math.max(0, stroke - .4), stroke, end: Math.min(duration, stroke + .95), strength: intent === 'emphasis' ? .85 : 1 });
  }
  gestures.sort((a, b) => a.stroke - b.stroke);
  const timedPhonemes = !!provided?.some(m => m.kind === 'phoneme' || m.kind === 'viseme');
  const mouthMarks = timedPhonemes ? marks.filter(m => m.kind === 'phoneme' || m.kind === 'viseme') : marks;
  const visemes = mouthMarks.flatMap(m => {
    const vowel = vowelFor(m);
    return vowel ? [{ start: m.start, end: m.end, vowel }] : [];
  });
  return { duration, gestures, visemes,
    timing: provided?.length ? alignment!.source + (timedPhonemes ? ': phoneme/viseme timing' : ': text timing; approximate articulation') : 'waveform-weighted text estimate; not phoneme alignment',
    expression: gestures[0]?.intent === 'greeting' ? 'happy' : gestures[0]?.intent === 'agreement' ? 'relaxed' : 'neutral' };
}

export function sampleVisemes(plan: SpeechPlan, time: number, volume: number): Partial<Record<Vowel, number>> {
  const active = plan.visemes.find(v => time >= v.start - .035 && time <= v.end + .035);
  return { [active?.vowel ?? 'aa']: clamp(volume, 0, 1) * .85 };
}
