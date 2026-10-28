import { Message } from './messages';
import { config } from '@/utils/config';

export async function getClaudeChatResponseStream(messages: Message[]): Promise<ReadableStream<string>> {
  const apiKey = sessionStorage.getItem('amica_claude_key') || '';
  if (!apiKey.trim()) throw new Error('Enter your Anthropic API key in Settings → Chatbot → Claude.');
  const response = await fetch('/api/claude/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, model: config('claude_model'), messages }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Claude request failed');
  }
  if (!response.body) throw new Error('Claude returned an empty response.');
  return response.body.pipeThrough(new TextDecoderStream());
}
