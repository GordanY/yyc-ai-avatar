// Shared macOS/Windows installer. Native wrappers bootstrap Node without admin access.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const tools = path.join(root, '.tools');
const windows = process.platform === 'win32';
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}).`);
}
function works(command, args) {
  return spawnSync(command, args, { stdio: 'ignore' }).status === 0;
}
const lfsHashes = {
  'darwin-amd64': '4292b3518e717e53c20a6c2c0696e2069a21e97500ad14b80b06bd52de8f3b72',
  'darwin-arm64': '0ba10e897e0496412cd86eacaed4ed554c97ddc29bc5c709d28faa5eaaa2222c',
  'windows-amd64': '5bb771c12b3dacc535e912d0270a010c209d4da2e63819c5918e3547c2defed9',
  'windows-arm64': '7e70990e339efab3e793affb919355b548c9a41c5b6bb52d90267bcb84ba4784',
};
function findBinary(directory, name) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === name) return file;
    if (entry.isDirectory()) { const found = findBinary(file, name); if (found) return found; }
  }
}
async function ensureLfs() {
  if (works('git', ['lfs', 'version'])) return;
  const platform = windows ? 'windows' : process.platform;
  const arch = process.arch === 'x64' ? 'amd64' : process.arch;
  const target = `${platform}-${arch}`;
  if (!lfsHashes[target]) throw new Error(`Install Git LFS for ${target}, then run setup again.`);
  const directory = path.join(tools, 'git-lfs');
  fs.mkdirSync(directory, { recursive: true });
  let binary = findBinary(directory, windows ? 'git-lfs.exe' : 'git-lfs');
  if (!binary) {
    const archive = path.join(tools, 'git-lfs.zip');
    console.log('Installing a project-local Git LFS 3.8.1...');
    const response = await fetch(`https://github.com/git-lfs/git-lfs/releases/download/v3.8.1/git-lfs-${target}-v3.8.1.zip`);
    if (!response.ok) throw new Error(`Git LFS download failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== lfsHashes[target]) throw new Error('Git LFS checksum mismatch.');
    fs.writeFileSync(archive, bytes);
    if (windows) {
      const literal = value => `'${value.replace(/'/g, "''")}'`;
      run('powershell.exe', ['-NoProfile', '-Command', `$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath ${literal(archive)} -DestinationPath ${literal(directory)} -Force`]);
    } else run('unzip', ['-oq', archive, '-d', directory]);
    fs.unlinkSync(archive);
    binary = findBinary(directory, windows ? 'git-lfs.exe' : 'git-lfs');
  }
  if (!binary) throw new Error('Git LFS executable was not found in the downloaded archive.');
  if (!windows) fs.chmodSync(binary, 0o755);
  process.env.PATH = `${path.dirname(binary)}${path.delimiter}${process.env.PATH}`;
  return binary;
}
async function main() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Use Node.js 22 or newer, or run the native setup wrapper.');
  if (!works('git', ['--version'])) throw new Error('Install Git, clone the private repository, and run setup again.');
  if (!fs.existsSync(path.join(root, '.git'))) throw new Error('Use a Git clone of this private repository; GitHub ZIP downloads can omit the large model files.');
  const localLfs = await ensureLfs();
  run('git', ['lfs', 'install', '--local', '--force', ...(localLfs ? ['--skip-repo'] : [])]);
  if (localLfs) {
    // Git invokes filters/hooks later, after this installer's PATH has gone away.
    const quote = value => "'" + value.replace(/\\/g, '/').replace(/'/g, "'\"'\"'") + "'";
    const executable = quote(localLfs);
    run('git', ['config', '--local', 'filter.lfs.process', `${executable} filter-process`]);
    run('git', ['config', '--local', 'filter.lfs.clean', `${executable} clean -- %f`]);
    run('git', ['config', '--local', 'filter.lfs.smudge', `${executable} smudge -- %f`]);
    for (const name of ['pre-push', 'post-checkout', 'post-commit', 'post-merge']) {
      const hook = spawnSync('git', ['rev-parse', '--git-path', `hooks/${name}`], { encoding: 'utf8' });
      if (hook.status !== 0) throw new Error(`Cannot find the local Git ${name} hook.`);
      const hookFile = hook.stdout.trim();
      const existing = fs.existsSync(hookFile) ? fs.readFileSync(hookFile, 'utf8') : '';
      if (existing && !existing.includes('# YYC local Git LFS') && !existing.includes(`git lfs ${name}`) && !existing.includes(`${executable} ${name}`)) {
        throw new Error(`Existing custom ${name} hook: install Git LFS globally and rerun setup to preserve your hook.`);
      }
      fs.mkdirSync(path.dirname(hookFile), { recursive: true });
      fs.writeFileSync(hookFile, `#!/bin/sh\n# YYC local Git LFS\n${executable} ${name} "$@"\n`, { mode: 0o755 });
    }
  }
  run('git', ['lfs', 'pull']);
  run(process.execPath, [path.join(__dirname, 'verify-assets.cjs')]);
  const environment = path.join(root, '.env.local');
  if (!fs.existsSync(environment)) fs.copyFileSync(path.join(root, '.env.example'), environment);
  const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), windows ? 'node_modules/npm/bin/npm-cli.js' : '../lib/node_modules/npm/bin/npm-cli.js');
  if (!fs.existsSync(npm)) throw new Error('npm is missing from your Node installation. Run the native setup wrapper.');
  run(process.execPath, [npm, 'ci', '--no-audit', '--no-fund']);
  if (process.argv.includes('--install-only')) return;
  console.log('\nOpen http://localhost:3000 — press Ctrl+C here to stop the server.\n');
  run(process.execPath, [npm, 'run', 'dev']);
}
main().catch(error => { console.error(`Setup failed: ${error.message}`); process.exitCode = 1; });
