import { describe, expect, test } from "@jest/globals";
import { Screenplay } from "../src/features/chat/messages";
import { processResponse } from "../src/utils/processResponse";

describe("Process Response Tests", () => {
  test("should return same thing", () => {
    const sentences: string[] = []
    const aiTextLog = "";
    const receivedMessage = "";
    const tag = "";

    let cbTriggered = false;

    const proc = processResponse({
      sentences,
      aiTextLog,
      receivedMessage,
      tag,
      isThinking: false,
      rolePlay: "",
      callback: (aiTalks: Screenplay[]) => {
        cbTriggered = true;
        expect(aiTalks).toEqual([]);
        return false;
      },
    });
    expect(proc.sentences).toStrictEqual([]);
    expect(proc.aiTextLog).toBe("");
    expect(proc.receivedMessage).toBe("");
    expect(proc.tag).toBe("");
    expect(proc.shouldBreak).toBe(false);
    expect(cbTriggered).toBe(false);
  });
});

describe('complete replies returned by the school source filter', () => {
  test('queues every sentence when the entire reply arrives in one network chunk', () => {
    const spoken: string[] = [];
    const proc = processResponse({
      sentences: [], aiTextLog: '', receivedMessage: '[happy]第一句介紹學校。\n第二句介紹課程。\n最後一句介紹活動。',
      tag: '', isThinking: false, rolePlay: '',
      callback: talks => { spoken.push(talks[0].talk.message.trim()); return false; },
    });
    expect(spoken.join('')).toBe('第一句介紹學校。第二句介紹課程。最後一句介紹活動。');
    expect(proc.receivedMessage).toBe('');
  });
});

test('flushes the final words even when a reply has no ending punctuation', () => {
  const spoken: string[] = [];
  const first = processResponse({ sentences: [], aiTextLog: '', receivedMessage: '[neutral]完整句子。\n最後幾個字', tag: '', isThinking: false, rolePlay: '', callback: talks => { spoken.push(talks[0].talk.message.trim()); return false; } });
  const last = processResponse({ ...first, final: true, callback: talks => { spoken.push(talks[0].talk.message.trim()); return false; } });
  expect(spoken.join('')).toBe('完整句子。最後幾個字');
  expect(last.receivedMessage).toBe('');
});

test('speech text is complete regardless of network chunk boundaries', () => {
  const reply = '[happy]第一句介紹學校。\n第二句介紹課程。\n最後一句沒有句號';
  for (let size = 1; size <= reply.length; size++) {
    const spoken: string[] = [];
    let state = { sentences: [] as string[], aiTextLog: '', receivedMessage: '', tag: '', isThinking: false, rolePlay: '', shouldBreak: false };
    const callback = (talks: Screenplay[]) => { spoken.push(talks[0].talk.message); return false; };
    for (let i = 0; i < reply.length; i += size) state = processResponse({ ...state, receivedMessage: state.receivedMessage + reply.slice(i, i + size), callback });
    state = processResponse({ ...state, final: true, callback });
    expect(spoken.join('').replace(/\s/g, '')).toBe('第一句介紹學校。第二句介紹課程。最後一句沒有句號');
    expect(state.receivedMessage).toBe('');
  }
});

test('honors interruption while draining a complete reply', () => {
  const spoken: string[] = [];
  const proc = processResponse({ sentences: [], aiTextLog: '', receivedMessage: '[happy]第一句。\n第二句。', tag: '', isThinking: false, rolePlay: '', final: true, callback: talks => { spoken.push(talks[0].talk.message.trim()); return true; } });
  expect(spoken).toEqual(['第一句。']);
  expect(proc.shouldBreak).toBe(true);
  expect(proc.receivedMessage).toContain('第二句');
});

test('provides current thinking state for every utterance drained in one call', () => {
  const spoken: string[] = [];
  const proc = processResponse({ sentences: [], aiTextLog: '', receivedMessage: '</think>[happy]第一句。\n第二句。\n', tag: '', isThinking: true, rolePlay: '', final: true,
    callback: (talks, state) => { if (!state.isThinking) spoken.push(talks[0].talk.message.trim()); return false; },
  });
  expect(spoken).toEqual(['第一句。', '第二句。']);
  expect(proc.isThinking).toBe(false);
});
