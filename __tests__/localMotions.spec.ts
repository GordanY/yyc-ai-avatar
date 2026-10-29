/** @jest-environment node */
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import handler from '../src/pages/api/localMotions';
import { createGestureCatalog } from '../src/features/avatarMotion/gestureCatalog';

const files = ['showFullBody', 'greeting', 'peaceSign', 'shoot', 'spin', 'modelPose', 'squat'];
let directory: string;
let originalDirectory: string | undefined;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yyc gesture '));
  originalDirectory = process.env.AMICA_MOTION_PACK_DIR;
  process.env.AMICA_MOTION_PACK_DIR = directory; // A fresh machine has no downloaded numbered pack.
});
afterEach(async () => {
  if (originalDirectory === undefined) delete process.env.AMICA_MOTION_PACK_DIR;
  else process.env.AMICA_MOTION_PACK_DIR = originalDirectory;
  await fs.rm(directory, { recursive: true, force: true });
});
async function request(query: Record<string, unknown> = {}, method = 'GET') {
  const res: any = { code: 200, headers: {}, data: undefined };
  res.setHeader = (name: string, value: string) => { res.headers[name] = value; };
  res.status = (code: number) => { res.code = code; return res; };
  res.json = res.send = (data: unknown) => { res.data = data; return res; };
  res.end = () => res;
  await handler({ method, query } as any, res);
  return res;
}

test('a fresh installation exposes all seven full-body gestures without a downloaded pack', async () => {
  const res = await request();
  expect(res.code).toBe(200);
  expect(res.data.motions).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(res.data.credit).toContain('pixiv Inc.');
  expect(createGestureCatalog(['happy'], res.data.motions).filter(action => action.category === 'fullBody')).toHaveLength(7);
});

test('every gesture ID serves the corresponding bundled VRMA bytes', async () => {
  for (const [index, file] of files.entries()) {
    const res = await request({ id: String(index + 1) });
    const expected = await fs.readFile(path.join(process.cwd(), 'public', 'animations', `${file}.vrma`));
    expect(res.code).toBe(200);
    expect(res.headers['Content-Type']).toBe('model/gltf-binary');
    expect(Buffer.isBuffer(res.data)).toBe(true);
    expect(res.data.equals(expected)).toBe(true);
    expect(res.data.subarray(0, 4).toString()).toBe('glTF');
  }
});

test('an explicit partial numbered override takes priority while other gestures stay bundled', async () => {
  const override = await fs.readFile(path.join(process.cwd(), 'public', 'animations', 'peaceSign.vrma'));
  await fs.mkdir(path.join(directory, 'vrma'));
  await fs.writeFile(path.join(directory, 'vrma', 'VRMA_01.vrma'), override);
  expect((await request({ id: '1' })).data.equals(override)).toBe(true);
  expect((await request({ id: '2' })).code).toBe(200);
  expect((await request()).data.motions).toEqual([1, 2, 3, 4, 5, 6, 7]);
});

test('invalid IDs and unsupported methods cannot read arbitrary files', async () => {
  for (const id of ['0', '8', '01', '../package.json', ['1', '2']]) {
    expect((await request({ id })).code).toBe(400);
  }
  const res = await request({}, 'POST');
  expect(res.code).toBe(405);
  expect(res.headers.Allow).toBe('GET');
});
