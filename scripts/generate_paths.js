const fs = require('fs');
const fg = require('fast-glob');
const path = require('path');

const ROOT = path.join(__dirname, './../public');

const urls = pattern => fg.globSync(pattern, { cwd: ROOT, dot: true })
  .sort().map(file => '/' + file.replace(/\\/g, '/'));
const bgImages = urls('bg/**/bg-*.jpg');
const vrmList = urls('vrm/**/*.vrm');
const speechT5SpeakerEmbeddingsList = urls('speecht5_speaker_embeddings/**/*.bin');
const animationList = [].concat(
  urls('animations/**/*.vrma'),
  urls('animations/**/*.fbx')
);

let str = "";
str += `export const bgImages = ${JSON.stringify(bgImages)};\n`;
str += `export const vrmList = ${JSON.stringify(vrmList)};\n`;
str += `export const speechT5SpeakerEmbeddingsList = ${JSON.stringify(speechT5SpeakerEmbeddingsList)};\n`;
str += `export const animationList = ${JSON.stringify(animationList)};\n`;

fs.writeFileSync(path.join(__dirname, './../src/paths.ts'), str);
