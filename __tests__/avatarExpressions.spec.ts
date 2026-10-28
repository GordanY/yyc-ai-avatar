/** @jest-environment node */
import { test, expect } from '@jest/globals';
import * as THREE from 'three';
import { VRMExpression, VRMExpressionManager } from '@pixiv/three-vrm';
import { ExpressionController } from '../src/features/emoteController/expressionController';
import { AutoBlink } from '../src/features/emoteController/autoBlink';
function fixture() {
  const manager = new VRMExpressionManager(); const happy = new VRMExpression('happy');
  happy.overrideBlink = 'block'; happy.overrideMouth = 'block'; manager.registerExpression(happy);
  for (const name of ['blink','aa','ih','ou','ee','oh']) manager.registerExpression(new VRMExpression(name));
  return { manager, controller: new ExpressionController({ expressionManager: manager } as any, new THREE.Object3D()) };
}
test('inactive moods reach exact zero so authored VRM1 block overrides release', () => {
  const {manager,controller}=fixture(); controller.playEmotion('happy');
  for(let i=0;i<60;i++)controller.update(1/60);
  expect(manager.getValue('happy')).toBeGreaterThan(.3);
  controller.playEmotion('neutral'); for(let i=0;i<600;i++)controller.update(1/60);
  expect(manager.getValue('happy')).toBe(0);
  expect((manager as any)._calculateWeightMultipliers()).toEqual({blink:1,lookAt:1,mouth:1});
});
test('an incompatible mood cannot block speech visemes while audio is active', () => {
  const {manager,controller}=fixture(); controller.playEmotion('happy');controller.setSpeaking(true);controller.setVisemes({ou:.7});
  for(let i=0;i<60;i++)controller.update(1/60);
  expect(manager.getValue('happy')).toBe(0);expect(manager.getValue('ou')).toBeGreaterThan(.4);
  expect((manager as any)._calculateWeightMultipliers().mouth).toBe(1);
});
test('held eye closure owns the blink channel and natural blinking resumes after it', () => {
  const { manager } = fixture(); const blink = new AutoBlink(manager);
  for (let i = 0; i < 600; i++) { blink.update(1 / 60, .85); expect(manager.getValue('blink')).toBe(.85); }
  blink.update(1 / 60); expect(manager.getValue('blink')).toBe(0);
  let seenBlink = false;
  for (let i = 0; i < 600; i++) { blink.update(1 / 60); seenBlink ||= (manager.getValue('blink') ?? 0) > .5; }
  expect(seenBlink).toBe(true);
});
test('closed-eye smiling does not add another blink on top of an authored eyelid expression', () => {
  const { manager, controller } = fixture();
  controller.setGesture({ action: { id: 'smile', label: 'Smile', category: 'face', duration: 3, expression: 'happy', eyes: 'closed' }, source: 'preview', time: 1, weight: 1 });
  for (let i = 0; i < 60; i++) controller.update(1 / 60);
  expect(manager.getValue('happy')).toBeGreaterThan(.6); expect(manager.getValue('blink')).toBe(0);
});
