import * as THREE from 'three';
import { VRM, VRMExpressionManager, VRMExpressionPresetName } from '@pixiv/three-vrm';
import { AutoLookAt } from './autoLookAt';
import { AutoBlink } from './autoBlink';
import { emotionNames } from '@/features/chat/messages';
import { Vowel } from '../avatarMotion/speechPlan';
import { GestureFrame } from '../avatarMotion/gestureScheduler';

const vowels: Vowel[] = ['aa', 'ih', 'ou', 'ee', 'oh'];
export class ExpressionController {
  private look: AutoLookAt;
  private blink?: AutoBlink;
  private manager?: VRMExpressionManager;
  private emotion = 'neutral';
  private speaking = false;
  private moods = new Map<string, number>();
  private lipTargets: Partial<Record<Vowel, number>> = {};
  private lips: Partial<Record<Vowel, number>> = {};
  private gesture?: GestureFrame;
  constructor(vrm: VRM, camera: THREE.Object3D) {
    this.look = new AutoLookAt(vrm, camera);
    this.manager = vrm.expressionManager ?? undefined;
    if (this.manager) {
      this.blink = new AutoBlink(this.manager);
      this.registerExpression(vrm);
    }
  }
  registerExpression(vrm: VRM) {
    const names = Object.keys(vrm.expressionManager?.expressionMap ?? {});
    for (const name of names) if (!emotionNames.includes(name)) emotionNames.push(name);
    return names;
  }
  playEmotion(preset: VRMExpressionPresetName | string) {
    let name = this.manager?.getExpression(preset) ? preset : preset.toLowerCase();
    if (name === 'relaxed' && !this.manager?.getExpression(name)) name = 'happy';
    if (name !== 'neutral' && !this.manager?.getExpression(name)) name = 'neutral';
    this.emotion = name;
    if (name !== 'neutral' && !this.moods.has(name)) this.moods.set(name, 0);
  }
  lipSync(preset: VRMExpressionPresetName | string, value: number) { this.setVisemes({ [preset]: value }); }
  setSpeaking(speaking: boolean) { this.speaking = speaking; }
  setVisemes(values: Partial<Record<Vowel, number>>) { this.lipTargets = values; }
  setGesture(frame?: GestureFrame) {
    this.gesture = frame;
    const expression = frame?.action.expression;
    if (expression && !this.moods.has(expression)) this.moods.set(expression, 0);
  }
  update(delta: number) {
    this.look.update(delta);
    for (const [name, previous] of this.moods) {
      // Respect an asset's authored incompatible mouth shape. Don't let an
      // emotion with overrideMouth=block suppress spoken visemes.
      const blockedMouth = this.speaking && this.manager?.getExpression(name)?.overrideMouth === 'block';
      const gestureWeight = this.gesture?.action.expression ? this.gesture.weight : 0;
      const target = blockedMouth ? 0 : (name === this.emotion ? .35 * (1 - gestureWeight) : 0) + (name === this.gesture?.action.expression ? .65 * gestureWeight : 0);
      let value = blockedMouth ? 0 : previous + (target - previous) * (1 - Math.exp(-delta * 7));
      // 'block' overrides activate for ANY positive weight, even 1e-30.
      if (target === 0 && value < .001) value = 0;
      this.moods.set(name, value); this.manager?.setValue(name, value);
    }
    const total = vowels.reduce((sum, name) => sum + Math.max(0, this.lipTargets[name] ?? 0), 0);
    for (const name of vowels) {
      const target = Math.max(0, this.lipTargets[name] ?? 0) / Math.max(1, total) * .75;
      const previous = this.lips[name] ?? 0;
      const value = previous + (target - previous) * (1 - Math.exp(-delta * (target > previous ? 25 : 18)));
      this.lips[name] = value; this.manager?.setValue(name, value);
    }
    // Facial moods do not suppress natural blinking for an entire utterance.
    const ownsEyelids = [...this.moods].some(([name, value]) => value > 0 && this.manager?.getExpression(name)?.overrideBlink === 'block');
    this.blink?.update(delta, this.gesture?.action.eyes ? this.gesture.weight : 0, ownsEyelids);
  }
  dispose() { this.look.dispose(); }
}
