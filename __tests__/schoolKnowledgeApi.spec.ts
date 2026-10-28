/** @jest-environment node */
import { test, expect, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import handler from '../src/pages/api/claude';

test('the real Claude handler supplies new PDF facts and query-selected pages to its upstream request', async () => {
  const originalFetch = global.fetch;
  let payload: any;
  global.fetch = jest.fn(async (_url: any, options: any) => {
    payload = JSON.parse(options.body);
    return new Response('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"[happy] 測試回答"}}\n\n');
  }) as any;
  const res: any = new EventEmitter();
  res.headers = {};
  res.headersSent = false;
  res.text = '';
  res.setHeader = (key: string, value: string) => { res.headers[key] = value; };
  res.write = (text: string) => { res.headersSent = true; res.text += text; };
  res.end = jest.fn();
  res.destroy = jest.fn();
  const question = '家長教師會第十二屆主席係邊個？';
  try {
    await handler({ method: 'POST', headers: { host: 'localhost:3000' }, body: {
      apiKey: 'test-key', model: 'test-model', messages: [{ role: 'system', content: 'Earlier saved character' }, { role: 'user', content: question }],
    } } as any, res);
    expect(payload.system).toContain('228項摘要');
    expect(payload.system).toContain('2025-2027');
    expect(payload.system).toContain('鄧韻芝');
    expect(payload.system).toContain('"source_file":"YY-0601.pdf","pdf_page":67');
    expect(payload.system).not.toContain('翁祐中學_開放日_QA_30題_updated_20251022.docx');
    expect(payload.messages).toEqual([{ role: 'user', content: question }]);
    expect(res.headers['X-School-Knowledge-Version']).toBe('2026-10-28');
    expect(res.headers['X-School-Knowledge-Facts']).toBe('228');
    expect(res.text).toBe('[happy] 測試回答');
    expect(res.end).toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test('source fragments are withheld until the answer is filtered, before display or speech', async () => {
  const originalFetch = global.fetch;
  let leakBeforeComplete = false;
  const writes: string[] = [];
  const res: any = new EventEmitter();
  res.setHeader = () => {};
  res.headersSent = false;
  res.write = (text: string) => { writes.push(text); res.headersSent = true; };
  res.end = jest.fn();
  res.destroy = jest.fn();
  global.fetch = jest.fn(async () => new Response(new ReadableStream({
    start(controller) {
      const event = (text: string) => new TextEncoder().encode(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })}\n\n`);
      controller.enqueue(event('[happy]初中每級有兩班英語班。來源：YY-'));
      setTimeout(() => {
        leakBeforeComplete = writes.length > 0;
        controller.enqueue(event('0601.p'));
        controller.enqueue(event('df，第5頁。'));
        controller.close();
      }, 5);
    },
  }))) as any;
  try {
    await handler({ method: 'POST', headers: { host: 'localhost:3000' }, body: {
      apiKey: 'test-key', model: 'test-model', messages: [{ role: 'user', content: '請提供來源和頁碼' }],
    } } as any, res);
    expect(leakBeforeComplete).toBe(false);
    expect(writes.join('')).toContain('初中每級有兩班英語班');
    expect(writes.join('')).not.toMatch(/YY-|\.pdf|來源|第5頁/);
    expect(res.end).toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});
