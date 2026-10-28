/** @jest-environment node */
import { test, expect } from '@jest/globals';
import { GestureScheduler } from '../src/features/avatarMotion/gestureScheduler';
import { GestureAction, createGestureCatalog, parseGestureSelection } from '../src/features/avatarMotion/gestureCatalog';
const actions: GestureAction[] = [
  { id: 'wave', label: 'Wave', category: 'body', duration: 3 },
  { id: 'smile', label: 'Smile', category: 'face', duration: 3 },
];
function step(scheduler: GestureScheduler, seconds: number, blocked = false) { for (let i = 0; i < seconds * 20; i++) scheduler.update(.05, blocked); }

test('random playback is opt-in, uses only the pool, and avoids immediate repeats', () => {
  const scheduler = new GestureScheduler(actions, () => 0);
  step(scheduler, 60); expect(scheduler.frame).toBeUndefined();
  scheduler.configure(true, ['wave', 'smile', 'not-an-action']);
  const starts: string[] = []; let previous: string | undefined;
  for (let i = 0; i < 1600; i++) {
    scheduler.update(.05, false); const id = scheduler.frame?.action.id;
    if (id && id !== previous) starts.push(id); previous = id;
  }
  expect(starts.length).toBeGreaterThan(3);
  expect(starts.every((id, i) => id === (i % 2 ? 'smile' : 'wave'))).toBe(true);
});

test('Off blends out random playback, while previews still work with an empty pool', () => {
  const scheduler = new GestureScheduler(actions, () => 0);
  scheduler.configure(true, ['wave']); step(scheduler, 11);
  expect(scheduler.frame?.weight).toBe(1);
  scheduler.configure(false, []); scheduler.update(.05, false);
  expect(scheduler.frame!.weight).toBeGreaterThan(0); expect(scheduler.frame!.weight).toBeLessThan(1);
  step(scheduler, 1); expect(scheduler.frame).toBeUndefined();
  scheduler.preview('smile'); step(scheduler, 1); expect(scheduler.frame?.source).toBe('preview');
  step(scheduler, 60); expect(scheduler.frame).toBeUndefined();
});

test('speech preempts actions and queues a requested preview until free', () => {
  const scheduler = new GestureScheduler(actions, () => 0);
  scheduler.preview('wave'); step(scheduler, 1);
  step(scheduler, 1, true); expect(scheduler.frame).toBeUndefined();
  scheduler.preview('smile'); step(scheduler, 8, true);
  expect(scheduler.frame).toBeUndefined(); expect(scheduler.getSnapshot().phase).toBe('waiting');
  step(scheduler, 1); expect(scheduler.frame?.action.id).toBe('smile');
});

test('interruption clears queued previews and gives random actions a fresh cooldown', () => {
  const scheduler = new GestureScheduler(actions, () => 0);
  scheduler.configure(true, ['wave']); scheduler.preview('smile'); scheduler.interrupt();
  step(scheduler, 5); expect(scheduler.frame).toBeUndefined();
  step(scheduler, 8); expect(scheduler.frame?.action.id).toBe('wave');
});

test('a slow local load does not consume motion duration, and a failed load recovers', () => {
  const scheduler = new GestureScheduler(actions, () => 0);
  scheduler.preview('wave'); for (let i = 0; i < 100; i++) scheduler.update(.05, false, () => false);
  expect(scheduler.frame?.time).toBe(0); expect(scheduler.getSnapshot().phase).toBe('loading');
  scheduler.fail('wave', 'Unavailable'); expect(scheduler.frame).toBeUndefined();
  expect(scheduler.getSnapshot().error).toBe('Unavailable');
  scheduler.preview('smile'); step(scheduler, 1); expect(scheduler.frame?.action.id).toBe('smile');
});

test('settings tolerate malformed storage, and full-body motions are separate and opt-in', () => {
  expect(parseGestureSelection('[]')).toEqual([]);
  expect(parseGestureSelection('["wave",1,"wave"]')).toEqual(['wave']);
  expect(parseGestureSelection('not json')).toContain('closed-eye-smile');
  const catalog = createGestureCatalog(['happy', 'relaxed', 'blink', 'neutral'], [1,2,3,4,5,6,7]);
  expect(catalog.filter(action => action.category === 'fullBody')).toHaveLength(7);
  expect(catalog.find(action => action.id === 'closed-eye-smile')?.eyes).toBe('closed');
});
