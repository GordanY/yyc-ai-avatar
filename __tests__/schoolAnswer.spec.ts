/** @jest-environment node */
import { test, expect } from '@jest/globals';
import { sanitizeSchoolAnswer } from '../src/features/chat/schoolAnswer';

test.each([
  '[happy]初中每級有兩班全英語授課班。來源：1023-0925.pdf 第5頁（PDF實際頁次）',
  '[happy]初中每級有兩班全英語授課班。\nSources: YY-0601.pdf, p.5',
  '[happy]初中每級有兩班全英語授課班。（來源：學校.pdf，第五頁）',
  '[happy]根據2026年學校概覽，初中每級有兩班全英語授課班。',
])('retains school facts while removing provenance: %s', answer => {
  const safe = sanitizeSchoolAnswer(answer);
  expect(safe).toContain('初中每級有兩班全英語授課班');
  expect(safe).not.toMatch(/pdf|來源|sources?|第[五5]頁|概覽/i);
});

test.each([
  '[neutral]YY-0601.pdf 第25頁寫2023年。YY2-0604.pdf 第88頁寫2024年。',
  '[happy]見學校.pdf第五頁。',
  '資料來源：school_knowledge.json，PDF頁碼5。',
  'P2026:p005，page 5。',
  '[happy]資料來源是《學校概覽》。',
  '[happy]參考《學校概覽》。',
  '[happy]頁碼：5。',
  '[happy]你可以睇第５頁。',
  '[happy]來源為YY-0601，頁25。',
])('fails closed on source-only or source-dependent answers: %s', answer => {
  expect(sanitizeSchoolAnswer(answer)).toBe('[neutral]想了解更多，歡迎向在場老師查詢。');
});

test('preserves factual years, amounts, class names and school contact details', () => {
  const answer = '[happy]2026年有10科表現高於全港，最佳六科33分。3C蔡宇軒。電話3157 0632。';
  expect(sanitizeSchoolAnswer(answer)).toContain('2026年有10科');
  expect(sanitizeSchoolAnswer(answer)).toContain('33分');
  expect(sanitizeSchoolAnswer(answer)).toContain('3C蔡宇軒');
  expect(sanitizeSchoolAnswer(answer)).toContain('3157 0632');
});
