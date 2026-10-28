/** @jest-environment node */
import { test, expect } from '@jest/globals';
import { ReplyTextStream } from '../src/features/chat/replyTextStream';

test('reveals partial words immediately without waiting for punctuation or audio', () => {
  const text = new ReplyTextStream();
  expect(text.push('[neutral] 學校設')).toBe(' 學校設');
  expect(text.push('有不同課程')).toBe('有不同課程');
  expect(text.push('', true)).toBe('');
});

test('never leaks control tags or reasoning split across arbitrary chunks', () => {
  const source = '[happy]<think>Private draft.</think>你好！[neutral]歡迎參觀。';
  for (let size = 1; size <= source.length; size++) {
    const text = new ReplyTextStream();
    let visible = '';
    for (let i = 0; i < source.length; i += size) visible += text.push(source.slice(i, i + size));
    visible += text.push('', true);
    expect(visible).toBe('你好！歡迎參觀。');
  }
});

test('keeps ordinary comparison symbols and hides split stage directions', () => {
  const text = new ReplyTextStream();
  expect(text.push('2 < 3. *smi')).toBe('2 < 3. ');
  expect(text.push('les* Hello.')).toBe(' Hello.');
});
