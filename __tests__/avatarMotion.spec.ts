/** @jest-environment node */
import { test, expect } from '@jest/globals';
import * as THREE from 'three';
import { buildSpeechPlan, sampleVisemes, SpeechAlignment } from '../src/features/avatarMotion/speechPlan';
import { NaturalMotion } from '../src/features/avatarMotion/naturalMotion';

test('semantic cues follow timed words, rather than audio activity', () => {
  const alignment: SpeechAlignment = { source: 'test words', marks: [
    { text: 'Hello', start: .8, end: 1.2, kind: 'word' },
    { text: 'because', start: 3, end: 3.6, kind: 'word' },
    { text: 'important', start: 5.5, end: 6.2, kind: 'word' },
  ] };
  const plan = buildSpeechPlan('Hello! Because I can explain. Remember this important point.', 8, alignment);
  expect(plan.gestures.map(c => c.intent)).toEqual(['greeting', 'explanation', 'emphasis']);
  expect(plan.gestures[0].stroke).toBeCloseTo(1);
  expect(plan.gestures[1].stroke).toBeGreaterThanOrEqual(3);
  expect(plan.timing).toContain('test words');
  expect(buildSpeechPlan('Clouds fill the sky.', 5).gestures.length).toBeGreaterThan(0);
});

test('Cantonese meanings get restrained distinct gestures with a cooldown', () => {
  const p = buildSpeechPlan('大家好！首先我解釋一下。記住這個重要部分。冇錯，你答得正確。', 14);
  expect(p.gestures.slice(0, 4).map(g => g.intent)).toEqual(['greeting', 'explanation', 'emphasis', 'agreement']);
  p.gestures.slice(1).forEach((g, i) => expect(g.stroke - p.gestures[i].stroke).toBeGreaterThanOrEqual(1.5));
  expect(p.visemes).toEqual([]); // no invented phonemes for Han characters
});

test('fallback alignment uses voiced regions, retaining leading/trailing silence', () => {
  const p = buildSpeechPlan('Hello, because this matters.', 5, undefined, { step: .1, levels: [...new Array(10).fill(0), ...new Array(30).fill(.1), ...new Array(10).fill(0)] });
  expect(p.gestures[0].stroke).toBeGreaterThanOrEqual(1);
  expect(p.visemes.every(v => v.start >= 1 && v.end <= 4.001)).toBe(true);
  expect(p.timing).toContain('not phoneme alignment');
});

test('native phonemes select all five vowel shapes on the audio timeline', () => {
  const marks = ['ɑ', 'ɪ', 'u', 'ɛ', 'o'].map((text, i) => ({ text, start: i, end: i + .9, kind: 'phoneme' as const }));
  const p = buildSpeechPlan('different vowels', 5, { source: 'native', marks });
  expect(p.visemes.map(v => v.vowel)).toEqual(['aa', 'ih', 'ou', 'ee', 'oh']);
  expect(sampleVisemes(p, 2.4, .7)).toEqual({ ou: .7 * .85 });
  expect(p.timing).toContain('phoneme/viseme');
});

test('invalid native timings fall back safely and never schedule beyond audio', () => {
  const p = buildSpeechPlan('Hello', 1, { source: 'bad', marks: [{ text: 'a', start: NaN, end: 99, kind: 'phoneme' }] });
  expect(p.timing).toContain('estimate');
  expect(p.visemes.every(v => v.end <= 1)).toBe(true);
});

function rig() {
  const root = new THREE.Object3D(), nodes: Record<string, THREE.Object3D> = {};
  const add = (name: string, parent: THREE.Object3D, x = 0, y = 0) => { const n = new THREE.Object3D(); n.name = name; n.position.set(x, y, 0); parent.add(n); nodes[name] = n; return n; };
  const hips = add('hips', root, 0, 1);
  const spine = add('spine', hips, 0, .1), chest = add('chest', spine, 0, .2), neck = add('neck', chest, 0, .15); add('head', neck, 0, .1);
  for (const [side, sign] of [['left', -1], ['right', 1]] as const) {
    const arm = add(side + 'UpperArm', chest, sign * .17, .1), forearm = add(side + 'LowerArm', arm, sign * .25), hand = add(side + 'Hand', forearm, sign * .22);
    for (const f of ['Index', 'Middle', 'Ring', 'Little']) { let parent = hand; for (const s of ['Proximal', 'Intermediate', 'Distal']) parent = add(side + f + s, parent, sign * .02); }
    const leg = add(side + 'UpperLeg', hips, sign * .08); const lower = add(side + 'LowerLeg', leg, 0, -.45); add(side + 'Foot', lower, 0, -.45);
  }
  const vrm = { humanoid: { getNormalizedBoneNode: (n: string) => nodes[n] } } as any;
  return { vrm, root, nodes };
}

test('sustained silent idle is varied, does not accumulate, and leaves feet planted', () => {
  const { vrm, root, nodes } = rig(); const motion = new NaturalMotion(vrm, .2);
  motion.update(0); root.updateMatrixWorld(true);
  const foot = nodes.leftFoot.getWorldPosition(new THREE.Vector3());
  const start = nodes.head.quaternion.clone();
  let largestStep = 0, previous = nodes.head.quaternion.clone();
  for (let i = 0; i < 60 * 90; i++) {
    motion.prepareFrame(); motion.update(1 / 60); root.updateMatrixWorld(true);
    largestStep = Math.max(largestStep, previous.angleTo(nodes.head.quaternion)); previous.copy(nodes.head.quaternion);
    expect(nodes.leftFoot.getWorldPosition(new THREE.Vector3()).distanceTo(foot)).toBeLessThan(1e-9);
  }
  expect(start.angleTo(nodes.head.quaternion)).toBeGreaterThan(.002);
  expect(largestStep).toBeLessThan(.01);
  expect(Math.abs(nodes.rightUpperArm.rotation.z)).toBeLessThan(1.35);
  expect(nodes.leftUpperLeg.quaternion.angleTo(new THREE.Quaternion())).toBe(0);
});

test('speech cancellation eases arms back instead of snapping or retaining a cue', () => {
  const { vrm, nodes } = rig(); const reference = rig(); const baseline = new NaturalMotion(reference.vrm, .3); const motion = new NaturalMotion(vrm, .3); motion.update(0); baseline.update(0);
  const rest = nodes.rightLowerArm.quaternion.clone(); motion.startSpeech(buildSpeechPlan('Hello, welcome!', 3));
  for (let i = 0; i < 50; i++) { motion.prepareFrame(); motion.update(1 / 60, i / 60); baseline.prepareFrame(); baseline.update(1 / 60); }
  expect(nodes.rightLowerArm.quaternion.angleTo(rest)).toBeGreaterThan(.3);
  const before = nodes.rightLowerArm.quaternion.clone(); motion.stopSpeech();
  motion.prepareFrame(); motion.update(1 / 60); baseline.prepareFrame(); baseline.update(1 / 60);
  expect(before.angleTo(nodes.rightLowerArm.quaternion)).toBeLessThan(.1);
  for (let i = 0; i < 180; i++) { motion.prepareFrame(); motion.update(1 / 60); baseline.prepareFrame(); baseline.update(1 / 60); }
  expect(nodes.rightLowerArm.quaternion.angleTo(reference.nodes.rightLowerArm.quaternion)).toBeLessThan(.015);
  expect(motion.activeIntent).toBe(null);
});

test('quotations/explanations and negated cues do not trigger a greeting or emphasis', () => {
  for (const text of ['The word hello is used in English. This is not important.', '唔係重要嘅事情。不要歡迎。']) {
    expect(buildSpeechPlan(text, 8).gestures.some(cue => cue.intent === 'greeting' || cue.intent === 'emphasis')).toBe(false);
  }
});
test('native phonemes take precedence over overlapping word-level mouth estimates', () => {
  const p = buildSpeechPlan('Hello', 1, { source: 'native', marks: [
    { text: 'Hello', start: 0, end: 1, kind: 'word' },
    { text: 'a', start: 0, end: .5, kind: 'phoneme' },
    { text: 'o', start: .5, end: 1, kind: 'phoneme' },
  ] });
  expect(p.visemes.map(v=>v.vowel)).toEqual(['aa','oh']);
});

test('attentive idle breathes subtly without large aimless arm or head movement', () => {
  const {vrm,nodes}=rig();const motion=new NaturalMotion(vrm,.42);motion.update(0);
  const names=['spine','chest','head','leftUpperArm','rightUpperArm','leftLowerArm','rightHand'];
  const initial=Object.fromEntries(names.map(n=>[n,nodes[n].quaternion.clone()]));
  const variation=Object.fromEntries(names.map(n=>[n,0]));
  for(let i=0;i<3600;i++){
    motion.prepareFrame();motion.update(1/60);
    expect(motion.activeIntent).toBe(null);
    for(const n of names)variation[n]=Math.max(variation[n],initial[n].angleTo(nodes[n].quaternion));
    expect(Math.abs(nodes.rightUpperArm.rotation.z)).toBeLessThanOrEqual(77.01*Math.PI/180);
    expect(Math.abs(nodes.rightUpperArm.rotation.z)).toBeGreaterThanOrEqual(55*Math.PI/180);
  }
  expect(variation.spine).toBeGreaterThan(.002);expect(variation.head).toBeGreaterThan(.002);
  for (const value of Object.values(variation)) expect(value).toBeLessThan(.04);
  expect(variation.leftUpperArm).toBeLessThan(.02);expect(variation.rightUpperArm).toBeLessThan(.02);
});
test('ordinary speech adds varied presenter gestures while preserving planted feet and cancellation', () => {
  const a=rig(),b=rig();const idle=new NaturalMotion(a.vrm,.22),speaking=new NaturalMotion(b.vrm,.22);
  idle.update(0);speaking.update(0);const plan=buildSpeechPlan('Clouds fill the sky today.',8);
  expect(new Set(plan.gestures.map(cue => cue.intent))).toEqual(new Set(['explanation', 'agreement', 'emphasis']));
  speaking.startSpeech(plan);
  const observed = new Set<string>();
  for(let i=0;i<480;i++){
    idle.prepareFrame();speaking.prepareFrame();idle.update(1/60);speaking.update(1/60,i/60);
    if (speaking.activeIntent) observed.add(speaking.activeIntent);
    for(const name of ['spine','leftLowerArm','leftFoot','rightFoot'])expect(a.nodes[name].quaternion.angleTo(b.nodes[name].quaternion)).toBeLessThan(1e-7);
  }
  expect(observed).toEqual(new Set(['explanation', 'agreement', 'emphasis']));
  speaking.stopSpeech();
  for(let i=0;i<180;i++){idle.prepareFrame();speaking.prepareFrame();idle.update(1/60);speaking.update(1/60);}
  expect(speaking.activeIntent).toBeNull();
  for(const name of ['head','rightUpperArm','rightLowerArm'])expect(a.nodes[name].quaternion.angleTo(b.nodes[name].quaternion)).toBeLessThan(.015);
});

test('presenter gestures continue across long introductions and never start in a silent gap', () => {
  const text = '學校設有不同課程，學生參與校園活動。課堂讓同學學習新知識，學會與人合作。';
  const plan = buildSpeechPlan(text, 20);
  expect(plan.gestures.length).toBeGreaterThan(4);
  expect(plan.gestures.every(cue => cue.intent !== 'greeting')).toBe(true);
  const paused = buildSpeechPlan(text, 20, undefined, {step: .1, levels: Array.from({length: 200}, (_, i) => i < 35 || i > 140 ? .2 : 0)});
  expect(paused.gestures.length).toBeGreaterThan(0);
  expect(paused.gestures.every(cue => cue.stroke < 3.5 || cue.stroke > 14)).toBe(true);
});

 test('resting arms have a forward elbow bend and hands have graded relaxed curls', () => {
  const {vrm,nodes}=rig();const motion=new NaturalMotion(vrm,0);motion.update(0);
  expect(nodes.leftLowerArm.rotation.y).toBeLessThan(-.20);
  expect(nodes.rightLowerArm.rotation.y).toBeGreaterThan(.20);
  expect(nodes.leftLowerArm.rotation.z).toBeGreaterThan(.08);
  expect(nodes.leftLowerArm.rotation.z).toBeLessThan(.12);
  expect(nodes.leftLittleProximal.rotation.z).toBeGreaterThan(nodes.leftIndexProximal.rotation.z);
  expect(nodes.rightLittleIntermediate.rotation.z).toBeLessThan(nodes.rightIndexIntermediate.rotation.z);
});

test('a wave holds the forearm upright and explanation extends forward instead of sideways', () => {
  for (const body of ['greeting', 'explanation'] as const) {
    const { vrm, root, nodes } = rig(); const motion = new NaturalMotion(vrm, 0);
    motion.setGesture({ action: { id: body, label: body, body, category: 'body', duration: 4 }, source: 'preview', time: 1, weight: 1 });
    motion.update(0); root.updateMatrixWorld(true);
    const elbow = nodes.rightLowerArm.getWorldPosition(new THREE.Vector3());
    const wrist = nodes.rightHand.getWorldPosition(new THREE.Vector3());
    const forearm = wrist.clone().sub(elbow).normalize();
    if (body === 'greeting') expect(forearm.y).toBeGreaterThan(.90);
    else expect(forearm.z).toBeLessThan(-.65);
  }
});
