import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin } from '../../working/avatar-animation-loader.mjs';
const loader = new GLTFLoader();
const modelDir=process.env.YYC_AVATAR_OUT??'models/yyc-info-day';
// Geometry/rig validation needs no GPU or image decoder. Actual textured
// appearance must still be checked in Amica/Blender.
loader.register(parser => ({name:'HeadlessTextureValidation',loadTexture: async index => {
  const texture = new THREE.Texture(); texture.name=`texture-${index}`; return texture;
}}));
loader.register(parser => new VRMLoaderPlugin(parser));
const buffer=fs.readFileSync('public/vrm/YYC_InfoDay.vrm');
const gltf=await loader.parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
const vrm=gltf.userData.vrm;
if(!vrm) throw Error('VRM loader did not create a VRM');
VRMUtils.removeUnnecessaryVertices(gltf.scene);
VRMUtils.removeUnnecessaryJoints(gltf.scene);
for(const bone of ['hips','spine','chest','head','leftUpperArm','rightUpperArm','leftHand','rightHand','leftUpperLeg','rightUpperLeg','leftFoot','rightFoot']) {
  if(!vrm.humanoid.getNormalizedBoneNode(bone))throw Error(`Missing bone ${bone}`);
}
const expressions={};
for(const name of ['aa','ih','ou','ee','oh','blink','blinkLeft','blinkRight','happy','neutral']) {
  const e=vrm.expressionManager.getExpression(name);
  if(!e)throw Error(`Missing expression ${name}`);
  vrm.expressionManager.resetValues();
  vrm.update(1/60);
  const baseline=[];
  vrm.scene.traverse(o=>{if(o.morphTargetInfluences)baseline.push(...o.morphTargetInfluences);});
  vrm.expressionManager.setValue(name,1);
  vrm.update(1/60);
  let nonzero=0, cursor=0;
  vrm.scene.traverse(o=>{if(o.morphTargetInfluences)for(const v of o.morphTargetInfluences){if(Math.abs(v-baseline[cursor])>.001)nonzero++;cursor++;}});
  if(name!=='neutral'&&!nonzero)throw Error(`Expression ${name} has no active morph target`);
  expressions[name]=nonzero;
}
vrm.expressionManager.resetValues();
const arm=vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
arm.rotation.z=.5;
vrm.update(1/60);
const animations={};
const animationLoader=new GLTFLoader();
animationLoader.register(parser=>new VRMAnimationLoaderPlugin(parser));
for(const motion of ['idle','nod','wave']) {
  const data=fs.readFileSync(`public/animations/yyc/YYC_${motion}.vrma`);
  const loaded=await animationLoader.parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
  const animation=loaded.userData.vrmAnimations?.[0];
  if(!animation)throw Error(`Cannot load ${motion} with Amica animation loader`);
  const clip=animation.createAnimationClip(vrm);
  if(!clip.tracks.length)throw Error(`Empty ${motion} clip`);
  const mixer=new THREE.AnimationMixer(vrm.scene);
  mixer.clipAction(clip).play();
  mixer.setTime(clip.duration*.5);vrm.update(1/60);
  animations[motion]={duration:clip.duration,tracks:clip.tracks.length};
  mixer.stopAllAction();mixer.uncacheRoot(vrm.scene);
}
let meshes=0,vertices=0,triangles=0;
vrm.scene.traverse(o=>{if(o.isMesh){meshes++;vertices+=o.geometry.attributes.position.count;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;if(o.isSkinnedMesh&&o.skeleton.bones.length===0)throw Error('Incomplete skin');}});
const garmentData=JSON.parse(fs.readFileSync(`${modelDir}/uniform-geometry.json`,'utf8'));
const trousers=garmentData.find(g=>g.name==='YYC_Uniform_Trousers');
const legProfile=[.15,.40,.60,.80].map(height=>{
  let min=Infinity,max=-Infinity;
  for(const [x,y]of trousers.positions)if(x>0&&Math.abs(y-height)<.006){min=Math.min(min,x);max=Math.max(max,x);}
  return {height,centre:(min+max)/2,innerGap:2*min};
});
if(legProfile[0].centre<legProfile[2].centre+.004)throw Error('Legs still bow outward at the knees instead of following the A stance');
if(legProfile[1].innerGap>.04)throw Error('Middle leg gap is still too wide');
const exportedDoc=JSON.parse(buffer.subarray(20,20+buffer.readUInt32LE(12)).toString());
const skinIndex=exportedDoc.materials.findIndex(m=>m.name==='YYC_Uncovered_Skin');
const skinColourSrgb=exportedDoc.extensions.VRM.materialProperties[skinIndex].vectorProperties._Color.slice(0,3);
const skinLinear=exportedDoc.materials[skinIndex].pbrMetallicRoughness.baseColorFactor.slice(0,3);
const toLinear=c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
let sleeveMinZ=Infinity,sleeveMaxZ=-Infinity;
const rawBoneNames=exportedDoc.skins[1].joints.map(i=>exportedDoc.nodes[i].name);
const shirtGeometry=garmentData.find(g=>g.name==='YYC_Uniform_Shirt');
let shirtHem=Infinity;
for(let i=0;i<shirtGeometry.positions.length;i++){
  const p=shirtGeometry.positions[i];shirtHem=Math.min(shirtHem,p[1]);
  const arm=shirtGeometry.joints[i].reduce((sum,ji,k)=>sum+(rawBoneNames[ji].endsWith('_UpperArm')?shirtGeometry.weights[i][k]:0),0);
  if(arm>.8){sleeveMinZ=Math.min(sleeveMinZ,p[2]);sleeveMaxZ=Math.max(sleeveMaxZ,p[2]);}
}
const sleeveDepth=sleeveMaxZ-sleeveMinZ;
if(sleeveDepth>.125)throw Error(`Sleeve remains too bulky: ${sleeveDepth.toFixed(4)} m depth`);
if(shirtHem>.943||shirtHem<.925)throw Error(`Shirt hem is not the requested extended length: ${shirtHem}`);
if(!exportedDoc.nodes.some(n=>n.name==='YYC_Folded_Polo_Collar'&&n.mesh!==undefined))throw Error('Continuous folded polo collar missing');
if(exportedDoc.nodes.some(n=>/YYC_(Black_Collar|Tailored_Collar|Polo_CollarLeaf)/.test(n.name)&&n.mesh!==undefined))throw Error('Old round collar or separate collar tabs still active');

if(skinLinear.some((c,i)=>Math.abs(c-toLinear(skinColourSrgb[i]))>1e-6))throw Error('Body skin is using sRGB values as linear glTF factors');
const lowerLegVertices=trousers.positions.filter(v=>v[1]>.38&&v[1]<.43);
const trouserGap=2*Math.min(...lowerLegVertices.map(v=>Math.abs(v[0])));
if(trouserGap<.015)throw Error(`Trouser legs touch: gap ${trouserGap}`);
// Cloth must never borrow motion from the opposite leg at the inner seam.
const shirt=garmentData.find(g=>g.name==='YYC_Uniform_Shirt');
if(Object.keys(shirt.primitives).some(name=>!['YYC_Sports_Red','YYC_Sleeve_Red'].includes(name)))throw Error('Unexpected uniform material');
let crossLegVertices=0;
vrm.scene.traverse(o=>{
  if(!o.isSkinnedMesh||!o.name.startsWith('YYC_Uniform_Trousers'))return;
  const p=o.geometry.attributes.position,j=o.geometry.attributes.skinIndex,w=o.geometry.attributes.skinWeight;
  for(let v=0;v<p.count;v++){
    if(p.getY(v)>.86)continue;
    const opposite=p.getX(v)<0?'_R_':'_L_';
    for(let k=0;k<4;k++)if(w.array[v*4+k]>.001&&o.skeleton.bones[j.array[v*4+k]].name.includes(opposite)){crossLegVertices++;break;}
  }
});
if(crossLegVertices)throw Error(`Trouser inner seam has ${crossLegVertices} vertices weighted to the opposite leg`);
let wrongFootVertices=0;
vrm.scene.traverse(o=>{
  if(!o.isSkinnedMesh||!o.name.startsWith('Body'))return;
  const p=o.geometry.attributes.position,j=o.geometry.attributes.skinIndex,w=o.geometry.attributes.skinWeight;
  for(let v=0;v<p.count;v++){
    if(p.getY(v)>.25)continue;
    let k=0;for(let t=1;t<4;t++)if(w.array[v*4+t]>w.array[v*4+k])k=t;
    const name=o.skeleton.bones[j.array[v*4+k]].name;
    const side=name.includes('_L_')?-1:name.includes('_R_')?1:0;
    if(side*p.getX(v)<0)wrongFootVertices++;
  }
});
if(wrongFootVertices)throw Error(`Inner shoe vertices stretch toward the opposite foot: ${wrongFootVertices}`);

vrm.humanoid.resetNormalizedPose();
vrm.humanoid.getNormalizedBoneNode('leftUpperArm').rotation.z=THREE.MathUtils.degToRad(80);
vrm.humanoid.getNormalizedBoneNode('rightUpperArm').rotation.z=THREE.MathUtils.degToRad(-80);
vrm.update(0);vrm.scene.updateMatrixWorld(true);
let maxTorsoPanelDrift=0,torsoSamples=0;
vrm.scene.traverse(o=>{
  if(!o.isSkinnedMesh||!o.name.startsWith('YYC_Uniform_Shirt'))return;
  const uv=o.geometry.attributes.uv;
  for(let i=0;i<uv.count;i+=8){
    const x=(uv.getX(i)-.5)*.70,y=.93+uv.getY(i)*.52;
    if(Math.abs(x)<.12||Math.abs(x)>.17||y<1.16||y>1.28)continue;
    const actual=o.getVertexPosition(i,new THREE.Vector3());
    maxTorsoPanelDrift=Math.max(maxTorsoPanelDrift,Math.abs(actual.x-x));torsoSamples++;
  }
});
if(!torsoSamples)throw Error('Finalized uniform was not loaded; validate the exported avatar after finalize_uniform.py');
if(maxTorsoPanelDrift>.015)throw Error(`Torso panels move with the arms: ${maxTorsoPanelDrift.toFixed(4)} m drift`);
const report={shirtHemMetres:shirtHem,sleeveDepthMetres:sleeveDepth,collarStyle:"continuous folded polo with open V",wrongFootVertices,legProfile,skinColourSrgb,skinLinear,maxTorsoPanelDriftMetres:maxTorsoPanelDrift,torsoSamples,crossLegVertices,previousTriangles:132574,triangleIncreaseFactor:Number((triangles/132574).toFixed(2)),assetVersion:vrm.meta.version,loader:'@pixiv/three-vrm (same loader and geometry cleanup used by Amica)',vrmVersion:vrm.meta.metaVersion,meshes,vertices,triangles,trouserGapMetres:trouserGap,expressions,animations,textureRendering:'Not tested by headless validator; inspect Blender preview',bodyMotion:'All three VRMA clips parsed, retargeted and played with Amica animation loader'};
fs.writeFileSync(`${modelDir}/validation.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
