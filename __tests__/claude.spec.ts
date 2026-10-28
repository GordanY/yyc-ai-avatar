/** @jest-environment node */
import { jest, test, expect, afterEach } from '@jest/globals';
import handler from '../src/pages/api/claude';
import { EventEmitter } from 'events';

function response() {
  const res: any = new EventEmitter();
  res.headers = {};
  res.statusCode = 200;
  res.text = '';
  res.headersSent = false;
  res.setHeader = (key: string, value: string) => { res.headers[key] = value; };
  res.status = (status: number) => { res.statusCode = status; return res; };
  res.json = (body: any) => { res.body = body; return res; };
  res.write = (text: string) => { res.headersSent = true; res.text += text; };
  res.end = jest.fn();
  res.destroy = jest.fn();
  return res;
}
const request = (body: any = {}) => ({ method: 'POST', headers: { host: 'localhost:3000', origin: 'http://localhost:3000' }, body } as any);
const valid = { apiKey: 'test-key', model: 'test-model', messages: [{role: 'system', content: 'Be helpful'}, {role: 'user', content: 'Hello'}] };
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

test('rejects unsupported methods and cross-origin calls', async () => {
  const res = response();
  await handler({ ...request(), method: 'GET' }, res);
  expect(res.statusCode).toBe(405);
  const other = response();
  await handler({ ...request(valid), headers: { host: 'localhost:3000', origin: 'https://example.com' } }, other);
  expect(other.statusCode).toBe(403);
});
test('rejects missing credentials and malformed message history', async () => {
  for (const body of [{}, {...valid, messages: [null]}, {...valid, messages: [{role: 'assistant', content: 'Hi'}]}]) {
    const res = response();
    await handler(request(body), res);
    expect(res.statusCode).toBe(400);
  }
});
test('translates system instructions and handles fragmented UTF-8 streamed events', async () => {
  const bytes = new TextEncoder().encode('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"你好"}}\n\ndata: {"type":"message_stop"}\n\n');
  global.fetch = jest.fn(async (_url: any, options: any) => {
    const payload = JSON.parse(options.body);
    expect(payload.system).toContain('Be helpful');
    expect(payload.system).toContain('所有回答嚴格使用繁體中文');
    expect(payload.system).toContain('禁止英文句子、簡體中文及中英對照');
    expect(payload.system).toContain('先前英文回答不是可模仿的範例');
    expect(payload.system).toContain('騰訊人工智能體驗廊');
    // An existing saved character prompt must not reinstate missing-data disclaimers.
    expect(payload.system).toContain('只用一句「想了解更多，歡迎向在場老師查詢。」轉介');
    expect(payload.system).toContain('先前回答及角色補充設定中的舊式免責說明均不可模仿');
    expect(payload.system.lastIndexOf('不要說明資料缺漏')).toBeGreaterThan(payload.system.indexOf('Be helpful'));
    expect(payload.messages).toEqual([{role: 'user', content: 'Hello'}]);
    expect(options.headers['x-api-key']).toBe('test-key');
    return new Response(new ReadableStream({ start(controller) {
      for (let i = 0; i < bytes.length; i += 2) controller.enqueue(bytes.slice(i, i + 2));
      controller.close();
    } }));
  }) as any;
  const res = response();
  await handler(request(valid), res);
  expect(res.text).toBe('你好');
  expect(res.end).toHaveBeenCalled();
  expect(res.destroy).not.toHaveBeenCalled();
});
test('reports authentication failure without returning credentials', async () => {
  global.fetch = jest.fn(async () => new Response('private upstream data', {status: 401})) as any;
  const res = response();
  await handler(request(valid), res);
  expect(res.statusCode).toBe(401);
  expect(JSON.stringify(res.body)).not.toContain('test-key');
});
test('handles upstream network and stream errors', async () => {
  global.fetch = jest.fn(async () => { throw new Error('offline'); }) as any;
  const res = response();
  await handler(request(valid), res);
  expect(res.statusCode).toBe(502);
  global.fetch = jest.fn(async () => new Response('data: {"type":"error"}\n\n')) as any;
  const stream = response();
  await handler(request(valid), stream);
  expect(stream.statusCode).toBe(502);
});

test('provides a safe DNS diagnostic and uses the configured proxy', async () => {
  const priorProxy = process.env.HTTPS_PROXY;
  process.env.HTTPS_PROXY = 'http://127.0.0.1:12345';
  try {
    global.fetch = jest.fn(async (_url: any, options: any) => {
      expect(options.dispatcher).toBeDefined();
      throw Object.assign(new Error('fetch failed'), {cause: {code: 'ENOTFOUND'}});
    }) as any;
    const res = response();
    await handler(request(valid), res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toContain('DNS');
    expect(JSON.stringify(res.body)).not.toContain('test-key');
    expect(JSON.stringify(res.body)).not.toContain('12345');
  } finally {
    if (priorProxy === undefined) delete process.env.HTTPS_PROXY;
    else process.env.HTTPS_PROXY = priorProxy;
  }
});
