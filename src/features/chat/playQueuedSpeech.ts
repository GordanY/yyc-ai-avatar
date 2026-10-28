import { Screenplay } from './messages';
import { SpeechAlignment } from '../avatarMotion/speechPlan';

export type QueuedSpeech = {
  audioBuffer: ArrayBuffer | null;
  textAlreadyDisplayed?: boolean;
  screenplay: Screenplay;
  alignment?: SpeechAlignment;
  streamIdx: number;
};
type Speaker = { speak: (audio: ArrayBuffer, screenplay: Screenplay, onAudible?: () => void) => Promise<void> };

/** One sentence becomes visible at its first audible sample, not at TTS request
 * or decode completion. Stale/cancelled jobs never reveal delayed captions. */
export async function playQueuedSpeech(job: QueuedSpeech, callbacks: {
  speaker?: Speaker;
  isCurrent: () => boolean;
  showText: (text: string) => void;
  setSpeaking: (speaking: boolean) => void;
  onError: (reason: unknown) => void;
  onPresented?: () => void;
}) {
  if (!callbacks.isCurrent()) return;
  let presented = false;
  const present = () => {
    if (presented || !callbacks.isCurrent()) return;
    presented = true;
    if (!job.textAlreadyDisplayed) callbacks.showText(job.screenplay.text);
    callbacks.onPresented?.();
  };
  if (!job.audioBuffer || !callbacks.speaker) { present(); return; }
  try {
    await callbacks.speaker.speak(job.audioBuffer, { ...job.screenplay, alignment: job.alignment }, () => {
      if (!callbacks.isCurrent()) return;
      present(); callbacks.setSpeaking(true);
    });
  } catch (error) {
    if (callbacks.isCurrent()) {
      present(); // Keep the response readable if speech fails.
      callbacks.onError(error);
    }
  } finally {
    if (callbacks.isCurrent()) callbacks.setSpeaking(false);
  }
}
