const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'context/asset-manifest.json'), 'utf8'));
let failures = 0;
for (const asset of manifest.files) {
  const file = path.join(root, asset.path);
  if (!fs.existsSync(file) || fs.statSync(file).size !== asset.bytes) {
    console.error(`Missing or incomplete asset: ${asset.path} (run git lfs pull)`);
    failures++;
    continue;
  }
  // Stream large geometry/PDF files rather than keeping multiple copies in memory.
}
async function verify() {
  for (const asset of manifest.files) {
    const file = path.join(root, asset.path);
    if (!fs.existsSync(file) || fs.statSync(file).size !== asset.bytes) continue;
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    if (hash.digest('hex') !== asset.sha256) { console.error(`Asset checksum mismatch: ${asset.path}`); failures++; }
  }
  if (failures) process.exitCode = 1;
  else console.log(`Verified ${manifest.files.length} bundled asset and context files.`);
}
verify().catch(error => { console.error(error.message); process.exitCode = 1; });
