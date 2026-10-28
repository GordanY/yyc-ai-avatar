import { GestureAction } from './gestureCatalog';

export type GestureFrame = { action: GestureAction; source: 'preview' | 'random'; time: number; weight: number };
export type GestureSnapshot = {
  enabled: boolean; selected: string[]; activeId: string | null;
  source: 'preview' | 'random' | null; phase: 'idle' | 'waiting' | 'loading' | 'playing' | 'returning'; error: string;
};
const smooth = (x: number) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

/** Scheduling uses viewer time, with explicit priority for speech and previews. */
export class GestureScheduler {
  private enabled = false;
  private selected: string[] = [];
  private active?: GestureFrame;
  private pending?: string;
  private returning = false;
  private blocked = false;
  private ready = true;
  private lastRandom?: string;
  private wait = 10;
  private error = '';
  private listeners = new Set<() => void>();
  private snapshot: GestureSnapshot = { enabled: false, selected: [], activeId: null, source: null, phase: 'idle', error: '' };
  constructor(public readonly actions: GestureAction[], private random = Math.random) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  get frame() { return this.active; }
  private cooldown() { this.wait = 12 + this.random() * 12; }
  private publish() {
    const next: GestureSnapshot = { enabled: this.enabled, selected: this.selected, activeId: this.active?.action.id ?? this.pending ?? null,
      source: this.active?.source ?? (this.pending ? 'preview' : null), phase: this.active ? this.returning ? 'returning' : this.ready ? 'playing' : 'loading' : this.pending ? 'waiting' : 'idle', error: this.error };
    if (JSON.stringify(next) === JSON.stringify(this.snapshot)) return;
    this.snapshot = next; for (const listener of this.listeners) listener();
  }
  configure(enabled: boolean, selected: string[]) {
    this.enabled = enabled;
    this.selected = [...new Set(selected)].filter(id => this.actions.some(action => action.id === id));
    if (this.active?.source === 'random' && (!enabled || !this.selected.includes(this.active.action.id))) this.returning = true;
    this.publish();
  }
  preview(id: string) {
    if (!this.actions.some(action => action.id === id)) return;
    this.pending = id; this.error = '';
    if (this.active) this.returning = true;
    this.publish();
  }
  interrupt(immediate = false) {
    this.pending = undefined;
    if (immediate) this.active = undefined;
    this.returning = !!this.active; this.cooldown(); this.publish();
  }
  fail(id: string, message: string) {
    if (this.active?.action.id !== id) return;
    this.error = message; this.active = undefined; this.returning = false; this.cooldown(); this.publish();
  }
  update(delta: number, blocked: boolean, isReady: (action: GestureAction) => boolean = () => true) {
    const dt = Math.max(0, Math.min(delta, .1));
    if (blocked && !this.blocked) this.cooldown();
    this.blocked = blocked;
    if (blocked && this.active) this.returning = true;
    if (this.active) {
      this.ready = isReady(this.active.action);
      if (this.returning) {
        this.active.weight = Math.max(0, this.active.weight - dt / .3);
        if (this.active.weight === 0) { this.active = undefined; this.returning = false; this.cooldown(); }
      } else if (this.ready) {
        this.active.time += dt;
        const duration = this.active.action.duration;
        const fade = this.active.action.eyes === 'blink' ? .09 : .45;
        this.active.weight = smooth(this.active.time / fade) * smooth((duration - this.active.time) / fade);
        if (this.active.time >= duration) { this.active = undefined; this.cooldown(); }
      }
    }
    if (!this.active && !blocked) {
      let id = this.pending;
      let source: 'preview' | 'random' = 'preview';
      if (id) this.pending = undefined;
      else if (this.enabled && this.selected.length) {
        this.wait -= dt;
        if (this.wait <= 0) {
          const pool = this.selected.filter(value => value !== this.lastRandom);
          const choices = pool.length ? pool : this.selected;
          id = choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))];
          this.lastRandom = id; source = 'random';
        }
      }
      const action = this.actions.find(value => value.id === id);
      if (action) { this.active = { action, source, time: 0, weight: 0 }; this.ready = isReady(action); this.error = ''; }
    }
    this.publish();
  }
}
