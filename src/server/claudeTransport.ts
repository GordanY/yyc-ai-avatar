import { EnvHttpProxyAgent } from 'undici';

let proxyAgent: EnvHttpProxyAgent | undefined;

// Node 20's native fetch ignores proxy environment variables. Keep this
// server-only and route only Anthropic requests through the configured proxy.
export function fetchClaude(url: string, options: RequestInit): Promise<Response> {
  const useProxy = Boolean(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy);
  if (!useProxy) return fetch(url, options);
  proxyAgent ||= new EnvHttpProxyAgent();
  const request: RequestInit & { dispatcher: EnvHttpProxyAgent } = { ...options, dispatcher: proxyAgent };
  return fetch(url, request);
}

export function claudeConnectionError(error: unknown): string {
  const failure = error as { name?: string; cause?: { code?: string }; code?: string };
  const code = failure?.cause?.code || failure?.code;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Claude connection failed: DNS could not resolve api.anthropic.com. Check the server network or HTTPS proxy.';
  if (failure?.name === 'AbortError' || failure?.name === 'TimeoutError' || code === 'UND_ERR_CONNECT_TIMEOUT') return 'Claude connection timed out. Check the server network or HTTPS proxy and try again.';
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET') return 'Claude connection was refused or reset. Check the server network or HTTPS proxy.';
  return 'Unable to reach Claude from the local server. Check the server network or HTTPS proxy and try again.';
}
