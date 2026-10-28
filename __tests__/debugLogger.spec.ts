/** @jest-environment node */
import { describe, test, expect, jest } from '@jest/globals';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'public/debugLogger.js'), 'utf8');
function setup(fetch: any = jest.fn(async () => ({ ok: true }))) {
  let now = 1000;
  const original: any = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map(name => [name, jest.fn()]));
  const listeners: Record<string, (event: any) => void> = {};
  const window: any = { console: { ...original }, location: {hostname: 'localhost'}, addEventListener: (type: string, callback: any) => { listeners[type] = callback; } };
  const context = vm.createContext({ window, localStorage: {getItem: () => 'true'}, fetch, Date: {now: () => now} });
  vm.runInContext(source, context);
  return { window, original, listeners, fetch, advance: () => { now += 31000; } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

describe('debug logger failure isolation', () => {
  test('does not recurse when development tools wrap console methods later', async () => {
    const app = setup();
    const previous = app.window.console.error;
    app.window.console.error = (...args: any[]) => previous(...args);
    expect(() => app.window.console.error('wrapped by dev tools')).not.toThrow();
    await settle();
    expect(app.original.error).toHaveBeenCalledTimes(1);
    expect(app.original.error).toHaveBeenCalledWith('wrapped by dev tools');
  });

  test('failed uploads are caught and subsequent logs respect a cooldown', async () => {
    const fetch = jest.fn(async () => { throw new Error('offline'); });
    const app = setup(fetch);
    app.window.console.error('connection lost');
    await settle();
    for (let i = 0; i < 30; i++) app.window.console.error('still offline');
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(app.original.error).toHaveBeenCalledTimes(31);
    app.advance();
    app.window.console.warn('retry after cooldown');
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  test('allows only one upload in flight and bounds retained logs', () => {
    const fetch = jest.fn(() => new Promise(() => {}));
    const app = setup(fetch);
    for (let i = 0; i < 1000; i++) app.window.console.log(i);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(app.window.error_handler_logs).toHaveLength(200);
    expect(app.original.log).toHaveBeenCalledTimes(1000);
  });
  test('handles errors without Error objects and reports the rejection reason', async () => {
    const app = setup();
    app.listeners.error({message: 'script failed'});
    app.listeners.unhandledrejection({reason: new Error('network unavailable')});
    await settle();
    expect(app.original.error.mock.calls[0][0]).toBe('script failed');
    expect(app.original.error.mock.calls[1][1]).toContain('network unavailable');
  });
  test('cyclic log arguments do not break the real console', () => {
    const app = setup();
    const cyclic: any = {}; cyclic.self = cyclic;
    expect(() => app.window.console.log(cyclic)).not.toThrow();
    expect(app.original.log).toHaveBeenCalledWith(cyclic);
    expect(app.fetch).not.toHaveBeenCalled();
  });
});
