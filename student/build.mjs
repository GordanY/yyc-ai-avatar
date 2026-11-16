import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..'),out=path.join(root,'_site');
await mkdir(path.join(out,'assets','animations'),{recursive:true});
await build({entryPoints:[path.join(here,'main.mjs')],outfile:path.join(out,'app.js'),bundle:true,nodePaths:[path.join(here,'node_modules')],format:'esm',target:['es2022'],minify:true});
for(const name of ['index.html','style.css'])await copyFile(path.join(here,name),path.join(out,name));
// Version asset URLs so an updated page cannot keep an older cached interface.
const version=createHash('sha256').update(await readFile(path.join(out,'app.js'))).update(await readFile(path.join(out,'style.css'))).digest('hex').slice(0,12);
const html=await readFile(path.join(out,'index.html'),'utf8');
await writeFile(path.join(out,'index.html'),html.replace('./app.js','./app.js?v='+version).replace('./style.css','./style.css?v='+version));
await writeFile(path.join(out,'.nojekyll'),'');
const assets=[
 ['public/vrm/YYC_InfoDay.vrm','assets/YYC_InfoDay.vrm'],
 ...['idle','nod','wave'].map(name=>['public/animations/yyc/YYC_'+name+'.vrma','assets/animations/YYC_'+name+'.vrma'])
];
for(const [source,dest] of assets){
 const bytes=await readFile(path.join(root,source));
 if(bytes.subarray(0,4).toString()!=='glTF')throw new Error(source+' is not binary glTF. Run git lfs pull --include="public/vrm/YYC_InfoDay.vrm" first.');
 await writeFile(path.join(out,dest),bytes);
}
console.log('Built GitHub Pages site at _site. Only the school VRM and original YYC animations are bundled.');
