// Exercise a real Next server and bundled assets on both native platforms.
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.SMOKE_PORT || 3107);
const base = `http://127.0.0.1:${port}`;
let server;
let log = '';
function cleanup() {
  if (!server?.pid || server.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(-server.pid, 'SIGTERM'); } catch {} }
}
async function main() {
  const occupied = await new Promise(resolve => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
  if (occupied) throw new Error(`Smoke-test port ${port} is already in use.`);
  server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.on('error', error => { log += error.message; });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { log = (log + chunk).slice(-10000); });
  const deadline = Date.now() + 120000;
  let healthy = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Server exited: ${server.exitCode}`);
    try {
      const health = await fetch(`${base}/api/health/`, { signal: AbortSignal.timeout(10000) });
      if (health.ok && (await health.json()).service === 'amica') { healthy = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!healthy) throw new Error('Server did not become healthy.');
  for (const url of ['/', '/vrm/YYC_InfoDay.vrm', '/animations/yyc/YYC_idle.vrma']) {
    const response = await fetch(base + url, { method: url === '/' ? 'GET' : 'HEAD', signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    if (url === '/' && !(await response.text()).includes('__NEXT_DATA__')) throw new Error('Home page did not render Next HTML.');
  }
  const response = await fetch(`${base}/api/dataHandler/?type=config`);
  if (!response.ok) throw new Error('Local configuration API failed.');
  console.log('PASS: live health endpoint, rendered home page, YYC avatar, original animation and configuration API.');
}
main().catch(error => { console.error(error.message + '\n' + log); process.exitCode = 1; }).finally(cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });
