/** Add directional, pose-driven cuff bunching and restore the skin it exposes.
 * This augments the fitted shirt; its neutral silhouette and armhole rig remain.
 */
import fs from 'node:fs';import * as T from 'three';import{GLTFLoader}from'three/examples/jsm/loaders/GLTFLoader.js';import{VRMLoaderPlugin}from'@pixiv/three-vrm';
const input=process.argv[2]||'working/elbow-cloth-baseline/YYC_InfoDay.vrm',output=process.argv[3]||'working/elbow-corrected.vrm';
const raw=fs.readFileSync(input),length=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+length));let binary=Buffer.from(raw.subarray(28+length));
function read(d,bin,i){const a=d.accessors[i],v=d.bufferViews[a.bufferView],width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size={5121:1,5123:2,5125:4,5126:4}[a.componentType],get={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType];return Array.from({length:a.count},(_,k)=>Array.from({length:width},(_,j)=>bin[get]((v.byteOffset||0)+(a.byteOffset||0)+k*(v.byteStride||width*size)+j*size)))}
const accessor=(values,component=5126,target=34962)=>{const width=Array.isArray(values[0])?values[0].length:1,size=component===5123?2:4,buffer=Buffer.alloc(values.length*width*size),min=Array(width).fill(Infinity),max=Array(width).fill(-Infinity);for(let i=0;i<values.length;i++)for(let k=0;k<width;k++){const v=width===1?values[i]:values[i][k];buffer[component===5123?'writeUInt16LE':component===5125?'writeUInt32LE':'writeFloatLE'](v,(i*width+k)*size);min[k]=Math.min(min[k],v);max[k]=Math.max(max[k],v)}while(binary.length%4)binary=Buffer.concat([binary,Buffer.from([0])]);const offset=binary.length;binary=Buffer.concat([binary,buffer]);const view=doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:buffer.length,target})-1;return doc.accessors.push({bufferView:view,componentType:component,count:values.length,type:width===1?'SCALAR':'VEC'+width,...(component===5126?{min,max}:{})})-1};
const loader=new GLTFLoader();loader.register(()=>({name:'NoTexture',loadTexture:async()=>new T.Texture()}));loader.register(p=>new VRMLoaderPlugin(p));const{userData:{vrm}}=await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');vrm.update(0);vrm.scene.updateMatrixWorld(true);
const shirtIndex=doc.meshes.findLastIndex(m=>m.name==='YYC_Uniform_Shirt'),shirt=doc.meshes[shirtIndex],sleeveMaterial=doc.materials.findIndex(m=>m.name==='YYC_Sleeve_Red'),sleeve=shirt.primitives.find(p=>p.material===sleeveMaterial);if(!sleeve)throw Error('No articulated sleeve primitive');
const attrs=Object.fromEntries(Object.entries(sleeve.attributes).map(([key,index])=>[key,read(doc,binary,index)])),indices=read(doc,binary,sleeve.indices).flat(),boneNames=doc.skins[1].joints.map(i=>doc.nodes[i].name),smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
function normals(pos,indices){const sums=pos.map(()=>[0,0,0]);for(let k=0;k<indices.length;k+=3){const a=indices[k],b=indices[k+1],c=indices[k+2],u=pos[b].map((x,j)=>x-pos[a][j]),v=pos[c].map((x,j)=>x-pos[a][j]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];for(const i of [a,b,c])for(let j=0;j<3;j++)sums[i][j]+=n[j]}return sums.map(n=>{const l=Math.hypot(...n)||1;return n.map(x=>x/l)})}
const reports=[];
for(const [side,code]of[['left','L'],['right','R']]){
 const arm=boneNames.indexOf(`J_Bip_${code}_UpperArm`),used=new Map(),triangles=[];
 for(let k=0;k<indices.length;k+=3){const tri=indices.slice(k,k+3);if(!tri.every(i=>attrs.JOINTS_0[i].some((j,p)=>j===arm&&attrs.WEIGHTS_0[i][p]>.99)))continue;for(const i of tri){if(!used.has(i))used.set(i,used.size);triangles.push(used.get(i))}}
 const old=[...used.keys()],compact=Object.fromEntries(Object.entries(attrs).map(([key,data])=>[key,old.map(i=>data[i])]));
 const start=vrm.humanoid.getRawBoneNode(side+'UpperArm').getWorldPosition(new T.Vector3()),elbow=vrm.humanoid.getRawBoneNode(side+'LowerArm').getWorldPosition(new T.Vector3()),axis=elbow.sub(start).normalize(),u=axis.clone().cross(new T.Vector3(0,0,1)).normalize(),v=axis.clone().cross(u).normalize();

 // Turn the free cuff edge back into a narrow rolled hem. The same directional
 // corrections then bunch the complete rim, rather than opening a paper edge.
 const edges=new Map();for(let k=0;k<triangles.length;k+=3)for(let e=0;e<3;e++){const a=triangles[k+e],b=triangles[k+(e+1)%3],key=a<b?a+','+b:b+','+a;const item=edges.get(key);if(item)item.count++;else edges.set(key,{a,b,count:1})}
 const boundary=[...edges.values()].filter(e=>e.count===1),edgeVertices=[...new Set(boundary.flatMap(e=>[e.a,e.b]))];let previous=new Map(edgeVertices.map(i=>[i,i]));
 for(const [back,out]of[[.0005,.0015],[.0018,.0018],[.003,.0008]]){const next=new Map();for(const i of edgeVertices){const p=new T.Vector3().fromArray(compact.POSITION[i]),radial=p.clone().sub(start);radial.addScaledVector(axis,-radial.dot(axis)).normalize();const j=compact.POSITION.length;for(const key of Object.keys(compact))compact[key].push(compact[key][i].slice());compact.POSITION[j]=p.addScaledVector(axis,-back).addScaledVector(radial,out).toArray();next.set(i,j)}for(const {a,b}of boundary){const pa=previous.get(a),pb=previous.get(b),na=next.get(a),nb=next.get(b);triangles.push(pb,pa,na,pb,na,nb)}previous=next}
 compact.NORMAL=normals(compact.POSITION,triangles);
 const targets=[],names=[];
 for(let quadrant=0;quadrant<4;quadrant++){
  const direction=u.clone().multiplyScalar(Math.cos(quadrant*Math.PI/2)).addScaledVector(v,Math.sin(quadrant*Math.PI/2));
  const posed=compact.POSITION.map(pos=>{const p=new T.Vector3().fromArray(pos),offset=p.clone().sub(start),along=offset.dot(axis),radial=offset.addScaledVector(axis,-along),radius=radial.length(),t=Math.max(0,Math.min(1,(along-.025)/.145));if(t===0||radius<1e-7)return pos.slice();const angular=smooth((radial.dot(direction)/radius+.25)/.75),compression=.106*(.72*t+.28*smooth(t))*angular,fold=(.0025*Math.sin(3*Math.PI*t)**2*t*(1-t)+.003*Math.pow(t,10))*angular;return p.addScaledVector(axis,-compression).addScaledVector(radial,fold/radius).toArray()});
  const targetNormals=normals(posed,triangles),delta=posed.map((p,i)=>p.map((x,k)=>x-compact.POSITION[i][k])),deltaNormals=targetNormals.map((n,i)=>n.map((x,k)=>x-compact.NORMAL[i][k]));
  targets.push({POSITION:accessor(delta),NORMAL:accessor(deltaNormals)});names.push('YYC_ElbowFold_'+quadrant);
 }
 const attributes=Object.fromEntries(Object.entries(compact).map(([key,data])=>[key,accessor(data,key==='JOINTS_0'?5123:5126)]));
 const metadata={side,axis:axis.toArray(),u:u.toArray(),v:v.toArray(),startDegrees:45,fullDegrees:125};
 const mesh=doc.meshes.push({name:'YYC_Uniform_Shirt_Sleeve_'+code,primitives:[{attributes,indices:accessor(triangles,5125,34963),material:sleeveMaterial,mode:4,targets}],weights:[0,0,0,0],extras:{targetNames:names,yycElbowCloth:metadata}})-1;
 const node=doc.nodes.push({name:'YYC_Uniform_Shirt_Sleeve_'+code,mesh,skin:1})-1;doc.scenes[doc.scene||0].nodes.push(node);reports.push({side,vertices:compact.POSITION.length,folds:4});
}
shirt.primitives=shirt.primitives.filter(p=>p!==sleeve);
// Restore only the original skin triangles hidden beneath the former rigid cuffs.
// Their already warped positions, normals, weights and skin material are retained.
const sourceRaw=fs.readFileSync('public/vrm/AvatarSample_D.vrm'),sourceLength=sourceRaw.readUInt32LE(12),source=JSON.parse(sourceRaw.subarray(20,20+sourceLength)),sourceBinary=sourceRaw.subarray(28+sourceLength),skin=doc.meshes[1].primitives.find(p=>doc.materials[p.material].name==='YYC_Uncovered_Skin'),existing=read(doc,binary,skin.indices).flat(),seen=new Set();for(let k=0;k<existing.length;k+=3)seen.add(existing.slice(k,k+3).sort((a,b)=>a-b).join(','));let restored=0;
for(const primitive of source.meshes[1].primitives.filter(p=>p.material===9)){
 const js=read(source,sourceBinary,primitive.attributes.JOINTS_0),ws=read(source,sourceBinary,primitive.attributes.WEIGHTS_0),ix=read(source,sourceBinary,primitive.indices).flat();
 for(let k=0;k<ix.length;k+=3){const tri=ix.slice(k,k+3);if(!tri.some(i=>js[i].some((j,p)=>boneNames[j]?.endsWith('_UpperArm')&&ws[i][p]>.2)))continue;const key=tri.slice().sort((a,b)=>a-b).join(',');if(!seen.has(key)){seen.add(key);existing.push(...tri);restored++}}
}
skin.indices=accessor(existing,5125,34963);
doc.extensions.VRM.meta.version='0.4.5';doc.buffers[0].byteLength=binary.length;let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);binary=Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]);const header=Buffer.alloc(20),bin=Buffer.alloc(8);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);bin.writeUInt32LE(binary.length);bin.writeUInt32LE(0x004e4942,4);fs.writeFileSync(output,Buffer.concat([header,json,bin,binary]));console.log(JSON.stringify({input,output,sleeves:reports,restoredUpperArmTriangles:restored,bytes:fs.statSync(output).size}));
