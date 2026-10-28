import { buildSchoolSystemPrompt, schoolKnowledgeStatus } from '@/server/schoolContext';
import { fetchClaude, claudeConnectionError } from '@/server/claudeTransport';
import { sanitizeSchoolAnswer } from '@/features/chat/schoolAnswer';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-School-Knowledge-Version', schoolKnowledgeStatus.version);
  res.setHeader('X-School-Knowledge-Facts', String(schoolKnowledgeStatus.factCount));
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) {
    return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
  }
  const { apiKey, model, messages } = req.body || {};
  if (typeof apiKey !== 'string' || !apiKey.trim() || typeof model !== 'string' || !model.trim() || !Array.isArray(messages) || !messages.length || messages.some(m => !m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string')) {
    return res.status(400).json({ error: 'Provide an API key, model ID and text messages.' });
  }
  const conversation = messages.filter(m => m.role !== 'system' && m.content.trim()).map(({ role, content }) => ({ role, content }));
  if (!conversation.length || conversation[0].role !== 'user') {
    return res.status(400).json({ error: 'The conversation must start with a user message.' });
  }
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 90_000);
  res.on('close', () => abort.abort());
  try {
    const upstream = await fetchClaude('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: abort.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey.trim(), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: model.trim(), max_tokens: 1024, stream: true,
        system: buildSchoolSystemPrompt(messages.filter(m => m.role === 'system').map(m => m.content), conversation), messages: conversation }),
    });
    if (!upstream.ok || !upstream.body) {
      return res.status(upstream.status || 502).json({ error: `Anthropic returned HTTP ${upstream.status}. Check your key, model access and API credits.` });
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Accel-Buffering', 'no');
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let answer = ''; // Validate the complete answer before any text can reach display or TTS.
    try {
      while (true) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const lines = pending.split('\n');
        pending = lines.pop() || '';
        if (done && pending) lines.push(pending);
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const event = JSON.parse(line.slice(5).trim());
          if (event.type === 'error') throw new Error('Claude stream failed.');
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') answer += event.delta.text;
        }
        if (done) break;
      }
    } finally { reader.releaseLock(); }
    res.write(sanitizeSchoolAnswer(answer));
    res.end();
  } catch (error) {
    if (!res.headersSent) res.status(502).json({ error: claudeConnectionError(error) });
    else res.destroy();
  } finally { clearTimeout(timeout); }
}

export const config = { api: { bodyParser: { sizeLimit: '1mb' }, responseLimit: false } };
