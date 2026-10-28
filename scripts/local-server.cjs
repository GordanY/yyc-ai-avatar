const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const runtime = path.join(root, 'working');
const logFile = path.join(runtime, 'server.log');
const base = 'http://127.0.0.1:3000';
function healthy() {
  return new Promise(resolve => {
    const req = http.get(`${base}/api/health/`, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve(res.statusCode === 200 && JSON.parse(body).service === 'amica'); }
        catch { resolve(false); }
      });
      res.on('error', () => resolve(false));
    });
    req.setTimeout(2000, () => req.destroy());
    req.on('error', () => resolve(false));
  });
}
async function main() {
  if (await healthy()) { console.log('Amica is running at http://localhost:3000/'); return; }
  if (process.argv[2] === 'status') { console.log('Amica is not responding.'); process.exitCode = 1; return; }
  const occupied = await new Promise(resolve => {
    const socket = net.connect(3000, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
  if (occupied) throw new Error('Port 3000 is already in use. Check the existing server before starting another.');
  execFileSync(process.execPath, [path.join(root, 'scripts/generate_paths.js')], { cwd: root, stdio: 'inherit' });
  require('esbuild').buildSync({ absWorkingDir: root, entryPoints: ['src/workers/bvh/generateMeshBVH.worker.js'], bundle: true, minify: true, sourcemap: true, outfile: 'public/generateMeshBVH.worker.js' });
  fs.mkdirSync(runtime, { recursive: true });
  const log = fs.openSync(logFile, 'a');
  let child;
  try {
    child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3000'], {
      cwd: root, detached: true, stdio: ['ignore', log, log],
      env: { ...process.env, WATCHPACK_POLLING: '1000' },
    });
  } finally { fs.closeSync(log); }
  child.on('error', err => { console.error(err.message); process.exitCode = 1; });
  child.unref();
  if (!child.pid) throw new Error('Unable to start the local server.');
  fs.writeFileSync(path.join(runtime, 'server.pid'), `${child.pid}\n`);
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (await healthy()) { console.log(`Amica is running at http://localhost:3000/\nPID: ${child.pid}\nLog: ${logFile}`); return; }
    try { process.kill(child.pid, 0); }
    catch { throw new Error(`Server exited during startup. Read ${logFile}`); }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Startup is taking longer than expected. Read ${logFile}`);
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });
