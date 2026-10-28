export type BodyGesture = 'greeting' | 'explanation' | 'emphasis' | 'agreement';
export type GestureAction = {
  id: string;
  label: string;
  category: 'body' | 'face' | 'combined' | 'fullBody';
  duration: number;
  body?: BodyGesture;
  expression?: string;
  eyes?: 'closed' | 'blink';
  clipUrl?: string;
};

export const defaultGestureSelection = ['wave-smile', 'nod', 'closed-eye-smile'];
export const localMotionNames = ['Show full body / 展示全身', 'Greeting / 打招呼', 'Peace sign / 勝利手勢', 'Shoot / 射擊手勢', 'Spin / 轉身', 'Model pose / 擺姿勢', 'Squat / 下蹲'];

export function createGestureCatalog(expressions: string[], localMotions: number[] = []): GestureAction[] {
  const find = (...names: string[]) => names.find(name => expressions.includes(name));
  const smile = find('happy', 'joy', 'Joy');
  const actions: GestureAction[] = [
    { id: 'wave', label: 'Wave / 揮手', category: 'body', duration: 3.8, body: 'greeting' },
    { id: 'explain', label: 'Explain / 解說', category: 'body', duration: 3.6, body: 'explanation' },
    { id: 'emphasis', label: 'Emphasize / 強調', category: 'body', duration: 2.8, body: 'emphasis' },
    { id: 'nod', label: 'Nod / 點頭', category: 'body', duration: 2.4, body: 'agreement' },
  ];
  if (smile) actions.push(
    { id: 'wave-smile', label: 'Friendly wave / 微笑揮手', category: 'combined', duration: 3.8, body: 'greeting', expression: smile },
    { id: 'nod-smile', label: 'Smile and nod / 微笑點頭', category: 'combined', duration: 2.8, body: 'agreement', expression: smile },
    { id: 'closed-eye-smile', label: 'Closed-eye smile / 閉眼笑', category: 'face', duration: 3.2, expression: smile, eyes: 'closed' },
  );
  actions.push({ id: 'blink', label: 'Blink / 眨眼', category: 'face', duration: .45, eyes: 'blink' });
  for (const [label, candidates] of [
    ['Smile / 微笑', ['happy', 'joy', 'Joy']], ['Relaxed / 輕鬆', ['relaxed', 'fun', 'Fun']],
    ['Surprised / 驚訝', ['surprised', 'Surprised']], ['Sad / 難過', ['sad', 'sorrow', 'Sorrow']],
    ['Angry / 生氣', ['angry', 'Angry']], ['Neutral / 平靜', ['neutral', 'Neutral']],
  ] as [string, string[]][]) {
    const expression = find(...candidates);
    if (expression) actions.push({ id: 'face-' + expression, label, category: 'face', duration: 3, expression });
  }
  for (const index of localMotions) {
    if (index >= 1 && index <= 7) actions.push({ id: 'local-' + index, label: localMotionNames[index - 1], category: 'fullBody', duration: 10, clipUrl: '/api/localMotions?id=' + index });
  }
  return actions;
}

export function parseGestureSelection(value: string): string[] {
  try { const ids: unknown = JSON.parse(value); return Array.isArray(ids) ? [...new Set(ids.filter((id): id is string => typeof id === 'string'))] : defaultGestureSelection; }
  catch { return defaultGestureSelection; }
}
