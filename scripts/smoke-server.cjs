// Exercise a real Next server and bundled assets on both native platforms.
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');
const os = require('node:os');
const fs = require('node:fs');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.SMOKE_PORT || 3107);
const base = `http://127.0.0.1:${port}`;
let server;
let log = '';
let emptyPack;
function cleanup() {
  if (emptyPack) { fs.rmSync(emptyPack, { recursive: true, force: true }); emptyPack = undefined; }
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
  emptyPack = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc-empty-motions-'));
  server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, AMICA_MOTION_PACK_DIR: emptyPack },
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
  const listing = await fetch(`${base}/api/localMotions/`);
  if (!listing.ok || JSON.stringify((await listing.json()).motions) !== '[1,2,3,4,5,6,7]') throw new Error('Fresh installation did not expose all seven full-body gestures.');
  const files = ['showFullBody', 'greeting', 'peaceSign', 'shoot', 'spin', 'modelPose', 'squat'];
  for (const [index, file] of files.entries()) {
    const clip = await fetch(`${base}/api/localMotions/?id=${index + 1}`);
    if (!clip.ok) throw new Error(`Gesture ${index + 1}: HTTP ${clip.status}`);
    const bytes = Buffer.from(await clip.arrayBuffer());
    const bundled = fs.readFileSync(path.join(root, 'public', 'animations', `${file}.vrma`));
    const hash = data => crypto.createHash('sha256').update(data).digest('hex');
    if (bytes.subarray(0, 4).toString() !== 'glTF' || hash(bytes) !== hash(bundled)) throw new Error(`Gesture ${index + 1} did not serve the bundled VRMA.`);
  }
  console.log('PASS: live health endpoint, rendered home page, YYC avatar, original animation, configuration API and all seven bundled full-body gestures.');
}
main().catch(error => { console.error(error.message + '\n' + log); process.exitCode = 1; }).finally(cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });
