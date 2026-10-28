import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { GestureCue, SpeechPlan } from './speechPlan';
import { GestureFrame } from './gestureScheduler';

const rad = THREE.MathUtils.degToRad;
const smooth = (x: number) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const fingers = ['Index', 'Middle', 'Ring', 'Little'] as const;
const segments = ['Proximal', 'Intermediate', 'Distal'] as const;

const postureKeys = ['lean', 'twist', 'roll', 'pitch', 'yaw', 'tilt', 'leftArm', 'rightArm', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist', 'fingers'] as const;
type Posture = Record<(typeof postureKeys)[number], number>;
const neutralPosture = (): Posture => Object.fromEntries(postureKeys.map(key => [key, 0])) as Posture;

type BoneState = { node: THREE.Object3D; base: THREE.Quaternion; scale: THREE.Vector3; rendered: THREE.Quaternion; rest: THREE.Quaternion };

/** Owns upper-body offsets only. Hips, legs, feet and root translation are masked out. */
export class NaturalMotion {
  private states = new Map<string, BoneState>();
  private elapsed = 0;
  private phase: number;
  private randomState = 1;
  private postureFrom = neutralPosture();
  private postureTo = neutralPosture();
  private postureStart = 0;
  private postureEnd = 10;
  private plan?: SpeechPlan;
  private speechTime = 0;
  private speechWeight = 0;
  private ending = false;
  private standing = true;
  private manual = false;
  private gesture?: GestureFrame;
  private leftSign = 1;
  private rightSign = -1;
  private offset = new THREE.Quaternion();
  private euler = new THREE.Euler();
  private target = new THREE.Quaternion();
  public activeIntent: string | null = null;

  constructor(private vrm: VRM, seed = Math.random()) {
    this.phase = seed * Math.PI * 2;
    this.randomState = (seed * 0xffffffff) >>> 0;
    this.postureTo = this.nextPosture();
    this.postureEnd = 7 + this.random() * 7;
    const names = ['spine', 'chest', 'upperChest', 'neck', 'head', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand'];
    for (const side of ['left', 'right']) {
      for (const finger of fingers) for (const segment of segments) names.push(side + finger + segment);
      for (const segment of ['Metacarpal', 'Proximal', 'Distal']) names.push(side + 'Thumb' + segment);
    }
    for (const name of names) {
      const node = vrm.humanoid.getNormalizedBoneNode(name as VRMHumanBoneName);
      if (node) this.states.set(name, { node, base: node.quaternion.clone(), scale: node.scale.clone(), rendered: node.quaternion.clone(), rest: node.quaternion.clone() });
    }
    // VRM 0.x and 1.x can have opposite rest arm axes. Derive the lowering
    // direction from this rig rather than hard-coding one avatar's signs.
    this.leftSign = -Math.sign(vrm.humanoid.getNormalizedBoneNode('leftLowerArm')?.position.x || -1);
    this.rightSign = -Math.sign(vrm.humanoid.getNormalizedBoneNode('rightLowerArm')?.position.x || 1);
  }

  private random() {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 0x100000000;
  }

  private nextPosture(): Posture {
    const range = (min: number, max: number) => min + (max - min) * this.random();
    return { lean: range(-.15, .15), twist: range(-.2, .2), roll: range(-.1, .1),
      pitch: range(-.2, .2), yaw: range(-.4, .4), tilt: range(-.1, .1),
      leftArm: range(.1, .5), rightArm: range(.1, .5),
      leftElbow: range(-.7, .7), rightElbow: range(-.7, .7),
      leftWrist: range(-1, 1), rightWrist: range(-1, 1), fingers: range(-.4, .4) };
  }

  private posture(): Posture {
    while (this.elapsed >= this.postureEnd) {
      this.postureFrom = this.postureTo;
      this.postureTo = this.nextPosture();
      this.postureStart = this.postureEnd;
      this.postureEnd += 7 + this.random() * 7;
    }
    const blend = smooth((this.elapsed - this.postureStart) / (this.postureEnd - this.postureStart));
    const value = neutralPosture();
    for (const key of postureKeys) value[key] = this.postureFrom[key] + (this.postureTo[key] - this.postureFrom[key]) * blend;
    return value;
  }

  setStandingBase(enabled: boolean) { this.standing = enabled; }
  setManualAnimation(active: boolean) { this.manual = active; }
  startSpeech(plan: SpeechPlan) { this.plan = plan; this.speechTime = 0; this.ending = false; }
  stopSpeech() { this.ending = true; this.activeIntent = null; }
  setGesture(frame?: GestureFrame) { this.gesture = frame; }

  /** Undo last frame's additive layer before the mixer evaluates the clip base. */
  prepareFrame() {
    for (const state of this.states.values()) {
      state.node.quaternion.copy(state.base);
      state.node.scale.copy(state.scale);
    }
  }

  private cueWeight(cue: GestureCue) {
    const t = this.speechTime;
    if (t < cue.start || t > cue.end) return 0;
    return (t < cue.stroke ? smooth((t - cue.start) / Math.max(.01, cue.stroke - cue.start)) : 1 - smooth((t - cue.stroke) / Math.max(.01, cue.end - cue.stroke))) * cue.strength;
  }

  update(delta: number, speechTime?: number) {
    const dt = Math.min(.1, Math.max(0, delta));
    this.elapsed += dt;
    if (speechTime !== undefined && !this.ending) this.speechTime = speechTime;
    const targetSpeechWeight = this.plan && !this.ending && !this.manual ? 1 : 0;
    this.speechWeight += (targetSpeechWeight - this.speechWeight) * (1 - Math.exp(-dt / .20));
    if (this.ending && this.speechWeight < .002) this.plan = undefined;
    let cue: GestureCue | undefined, weight = 0;
    for (const candidate of this.plan?.gestures ?? []) {
      const value = this.cueWeight(candidate) * this.speechWeight;
      if (value > weight) { cue = candidate; weight = value; }
    }
    const explicit = !this.manual && (!this.plan || this.ending) && this.gesture?.action.body ? this.gesture : undefined;
    if (explicit) { cue = undefined; weight = explicit.weight; }
    this.activeIntent = weight > .02 ? explicit?.action.body ?? cue?.intent ?? null : null;
    const t = this.elapsed + this.phase;
    // An attentive presenter base: breathing and tiny posture adjustments.
    // Intentional actions, rather than wandering arms, provide larger movement.
    const breath = Math.sin(t * 1.42) * .7 + Math.sin(t * .91 + .8) * .3;
    const sway = Math.sin(t * .37) * .65 + Math.sin(t * .61 + 1.6) * .35;
    const glance = Math.sin(t * .23 + 1.1) * .7 + Math.sin(t * .47) * .3;
    const posture = this.posture();
    const idleGain = this.manual ? .25 : 1;
    const s = this.rightSign;
    const gesture = explicit?.action.body ?? cue?.intent;
    const strokePhase = explicit ? Math.max(0, explicit.time - .45) : cue ? Math.max(0, this.speechTime - cue.stroke) : 0;

    for (const [name, state] of this.states) {
      state.base.copy(state.node.quaternion);
      state.scale.copy(state.node.scale);
      let x = 0, y = 0, z = 0;
      const ownStanding = this.standing && !this.manual;
      const sign = name.startsWith('left') ? this.leftSign : this.rightSign;
      if (name === 'spine') { x = rad(.18 * breath + posture.lean) * idleGain; y = rad(.1 * sway + posture.twist) * idleGain; z = rad(.08 * sway + posture.roll) * idleGain; }
      if (name === 'chest' || name === 'upperChest') { x = rad(.18 * breath + .25 * posture.lean) * idleGain; y = rad(.25 * posture.twist) * idleGain; z = rad(.2 * posture.roll) * idleGain; }
      if (name === 'neck') { x = rad(.14 * Math.sin(t * .53) + .3 * posture.pitch) * idleGain; y = rad(.25 * glance + .45 * posture.yaw) * idleGain; }
      if (name === 'head') { x = rad(.18 * Math.sin(t * .41) + .7 * posture.pitch) * idleGain; y = rad(.28 * glance + .7 * posture.yaw) * idleGain; z = rad(.1 * sway + .5 * posture.tilt) * idleGain; }
      if (name.endsWith('UpperArm')) {
        if (ownStanding) {
          const lift = name.startsWith('left') ? posture.leftArm : posture.rightArm;
          const armIdle = 1 - (name.startsWith('right') ? .65 * weight : 0);
          z = sign * rad(76.7 - (lift + .05 * (1 + Math.sin(t * .31))) * armIdle + .1 * breath);
          x = rad(.35) * (Math.sin(t * .55 + (name.startsWith('left') ? 0 : 1.7)) * .7 + Math.sin(t * .83 + (name.startsWith('left') ? 1.1 : .3)) * .3) * armIdle;
        }
      }
      if (name.endsWith('LowerArm') && ownStanding) {
        const elbow = name.startsWith('left') ? posture.leftElbow : posture.rightElbow;
        // Bend forward at the elbow rather than holding the forearms out to
        // the sides. A small axial turn lets the palms face the thighs.
        x = sign * rad(8 + .25 * Math.sin(t * .27));
        y = -sign * rad(14 + elbow + .3 * Math.sin(t * .63 + (name.startsWith('left') ? .4 : 2)));
        z = sign * rad(6);
      }
      if (name.endsWith('Hand') && ownStanding) { y = sign * rad(2 + (name.startsWith('left') ? posture.leftWrist : posture.rightWrist)); z = sign * rad(2 + .2 * Math.sin(t * .55 + (name.startsWith('left') ? -.5 : 1.2))); }
      if (name.includes('Thumb') && ownStanding) { z = sign * rad(name.endsWith('Metacarpal') ? 5 : name.endsWith('Proximal') ? 12 : 8); y = sign * rad(7); }
      if (fingers.some(f => name.includes(f)) && ownStanding) {
        // The little/ring fingers rest more curled than the index finger.
        const finger = fingers.findIndex(f => name.includes(f));
        const curl = name.endsWith('Proximal') ? 16 + finger * 3 : name.endsWith('Intermediate') ? 20 + finger * 4 : 10 + finger * 2;
        z = sign * rad(curl + posture.fingers + .2 * Math.sin(t * .29 + name.length));
      }
      if (!this.manual && weight > 0) {
        if (gesture === 'agreement' && name === 'head') x += rad(5) * Math.sin(explicit ? Math.min(Math.PI * 2, strokePhase * 3.5) : strokePhase * 9) * weight;
        if (gesture === 'explanation' || gesture === 'greeting' || gesture === 'emphasis') {
          const wave = gesture === 'greeting';
          if (name === 'rightUpperArm') {
            x = THREE.MathUtils.lerp(x, rad(wave ? 10 : 20), weight);
            z = THREE.MathUtils.lerp(z, s * rad(wave ? 55 : 70), weight);
          }
          if (name === 'rightLowerArm') {
            x *= 1 - weight;
            // The normalized elbow's forward bend is Y. A wave additionally
            // folds the forearm upright; extending sideways is not a wave.
            y = THREE.MathUtils.lerp(y, s * rad(wave ? 25 : gesture === 'explanation' ? -70 : -50), weight);
            z = THREE.MathUtils.lerp(z, -s * rad(wave ? 145 : 15), weight);
          }
          if (name === 'rightHand') {
            // Rotate about the finger axis to show the palm: towards the
            // audience for waving, upwards for an explanatory open hand.
            x = THREE.MathUtils.lerp(x, -s * rad(90), weight);
            y *= 1 - weight;
            z *= 1 - weight;
            if (wave) z += rad(8) * Math.sin(strokePhase * 10) * weight;
            if (gesture === 'emphasis') x += rad(7) * Math.sin(strokePhase * 10) * weight;
          }
          if (name.startsWith('right') && (fingers.some(f => name.includes(f)) || name.includes('Thumb'))) z *= 1 - .7 * weight;
          if (name === 'head' && gesture === 'emphasis') x += rad(2.2) * Math.sin(strokePhase * 8) * weight;
        }
      }
      if (ownStanding && name.endsWith('UpperArm')) z = sign * rad(Math.max(55, Math.min(77, z * sign * 180 / Math.PI)));
      this.euler.set(x, y, z, 'XYZ');
      this.offset.setFromEuler(this.euler);
      this.target.copy(ownStanding ? state.rest : state.base).multiply(this.offset);
      // Keep a separate rendered pose: restoring the mixer base never causes
      // a discontinuity, including cancelled speech and explicit clip returns.
      state.rendered.slerp(this.target, 1 - Math.exp(-dt / .12));
      if (delta === 0 && ownStanding) state.rendered.copy(this.target);
      state.node.quaternion.copy(state.rendered);
      if (name === 'chest' && !this.manual) state.node.scale.z = state.scale.z * (1 + .002 * breath);
    }
  }
}
