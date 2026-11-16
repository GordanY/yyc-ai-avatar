import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';
import { CONFIG } from './config.mjs';
import { loadScholarAsset } from './scholar-asset.mjs';
import { NaturalMotion } from '../src/features/avatarMotion/naturalMotion.ts';

export class AvatarStage {
  constructor(mount,status) {
    this.mount=mount;this.status=status;this.mode='';this.revision=0;this.clips=new Map();
    this.frame=0;this.loopIndex=0;this.speakingIndex=0;this.speaking=false;this.lastLoop=0;
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  async show(mode) {
    if(mode===this.mode){this.reset();return;}
    this.mode=mode;const revision=++this.revision;this.disposeScene();
    this.loopIndex=0;this.speakingIndex=0;this.speaking=false;
    this.mount.dataset.speaking='false';delete this.mount.dataset.armLowering;
    this.mount.closest('.character').dataset.avatar=mode;
    document.getElementById('appearanceLabel').textContent='立體角色';
    this.mount.replaceChildren();this.status.textContent=mode==='scholar'?'正在載入古代文士⋯':'正在載入校服角色⋯';
    try {
      const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});this.renderer=renderer;
      renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
      this.mount.append(renderer.domElement);
      const scene=new THREE.Scene();this.scene=scene;
      this.camera=new THREE.PerspectiveCamera(30,1,.01,100);
      scene.add(new THREE.HemisphereLight(0xffffff,0x91a38d,2.4));
      const key=new THREE.DirectionalLight(0xfff4df,2.2);key.position.set(1,2,3);scene.add(key);
      const fill=new THREE.DirectionalLight(0xffffff,1);fill.position.set(-2,1,-1);scene.add(fill);
      this.controls=new OrbitControls(this.camera,renderer.domElement);
      this.controls.enablePan=false;this.controls.minDistance=.8;this.controls.maxDistance=7;
      this.controls.minPolarAngle=.35;this.controls.maxPolarAngle=Math.PI*.65;
      this.controls.addEventListener('change',()=>{
        this.mount.dataset.camera=this.camera.position.toArray().map(value=>value.toFixed(4)).join(',');
      });
      const resize=()=>{
        if(!this.renderer)return;const w=this.mount.clientWidth,h=this.mount.clientHeight;
        renderer.setSize(w,h);this.camera.aspect=w/Math.max(1,h);this.camera.updateProjectionMatrix();
      };
      this.observer=new ResizeObserver(resize);this.observer.observe(this.mount);resize();
      let warning='';
      if(mode==='scholar'){
        this.assetController=new AbortController();
        const bytes=await loadScholarAsset(CONFIG.scholarModel,this.assetController.signal);
        if(revision!==this.revision)return;
        const gltf=await new GLTFLoader().parseAsync(bytes,'');
        if(revision!==this.revision){VRMUtils.deepDispose(gltf.scene);return;}
        this.model=gltf.scene;
        for(const clip of gltf.animations)this.clips.set(clip.name,clip);
        if(!this.clips.has('idle'))throw new Error('Missing character animation');
      }else{
        const loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
        const gltf=await loader.loadAsync(CONFIG.schoolModel);
        if(revision!==this.revision){VRMUtils.deepDispose(gltf.scene);return;}
        const vrm=gltf.userData.vrm;if(!vrm)throw new Error('Invalid VRM');
        this.vrm=vrm;VRMUtils.rotateVRM0(vrm);this.model=vrm.scene;
        this.natural=new NaturalMotion(vrm,.5);
        this.armReferences=['leftUpperArm','rightUpperArm'].map(name=>({
          node:vrm.humanoid.getNormalizedBoneNode(name),rest:vrm.humanoid.getNormalizedBoneNode(name)?.quaternion.clone()
        }));
        const loaderAnimation=new GLTFLoader();loaderAnimation.register(parser=>new VRMAnimationLoaderPlugin(parser));
        const loaded=await Promise.allSettled(Object.entries(CONFIG.actions).map(async([name,url])=>{
          const data=await loaderAnimation.loadAsync(url);if(revision!==this.revision)return;
          const animation=data.userData.vrmAnimations?.[0];if(animation)this.clips.set(name,createVRMAnimationClip(animation,vrm));
        }));
        if(revision!==this.revision)return;
        warning=loaded.some(result=>result.status==='rejected')?'角色已載入 · 部分動作未能載入':'';
      }
      const model=this.model;scene.add(model);model.visible=false;this.rootBase=model.quaternion.clone();
      const box=new THREE.Box3().setFromObject(model),height=box.max.y-box.min.y;
      this.targetY=box.min.y+height*.53;
      this.camera.position.set(0,this.targetY,height*2.15);
      this.controls.target.set(0,this.targetY,0);this.controls.update();this.controls.saveState();
      this.mixer=new THREE.AnimationMixer(model);this.play('idle');
      this.previous?.setEffectiveWeight(1);this.mixer.update(0);
      if(this.natural){this.natural.setGesture(undefined);this.natural.update(0);this.recordArmPose();this.vrm.update(0);}
      model.visible=true;this.status.textContent=warning;this.mount.dataset.model=mode;
      this.lastLoop=performance.now()-CONFIG.loopSeconds*1000;
      const clock=new THREE.Clock();
      const tick=()=>{
        if(revision!==this.revision)return;this.frame=requestAnimationFrame(tick);
        const dt=Math.min(clock.getDelta(),.05),now=performance.now();
        if(!this.reduced){
          this.natural?.prepareFrame();this.mixer.update(dt);
          if(this.natural){
            this.updateProcedural(now,dt);
            this.vrm.expressionManager?.setValue('blink',Math.max(0,1-Math.abs(((now/1000)%4.7)-.12)/.1));
          }
          if(now>=this.actionUntil){
            if(this.speaking){const loop=CONFIG.speakingLoop;if(loop.length)this.play(loop[this.speakingIndex++%loop.length]);}
            else{
              if(this.currentAction!=='idle')this.play('idle');
              if(now-this.lastLoop>=CONFIG.loopSeconds*1000){
                this.lastLoop=now;const loop=CONFIG.idleLoop;if(loop.length)this.play(loop[this.loopIndex++%loop.length]);
              }
            }
          }
          this.vrm?.update(dt);
        }
        this.controls.update();renderer.render(scene,this.camera);
      };tick();
    }catch(error){
      if(revision===this.revision)this.status.textContent='3D 載入失敗。請重新整理，或檢查瀏覽器是否支援 WebGL。文字對話仍可使用。';
    }
  }
  play(name) {
    if((this.reduced&&name!=='idle')||!this.mixer||!this.model)return;
    this.model.quaternion.copy(this.rootBase);
    const procedural=this.vrm?{nod:'agreement',wave:'greeting',greeting:'greeting',explain:'explanation',emphasis:'emphasis'}[name]:undefined;
    const clip=this.clips.get(procedural?'idle':name==='greeting'?'wave':name)||this.clips.get('idle');if(!clip)return;
    const action=this.mixer.clipAction(clip);
    if(this.previous!==action){action.reset().fadeIn(.35).play();this.previous?.fadeOut(.35);this.previous=action;}
    else action.reset().play();
    this.procedural=procedural;this.actionStart=performance.now();
    const duration=this.vrm?({nod:2.4,wave:3.8,greeting:3.8,explain:3.6,emphasis:2.8}[name]??clip.duration):clip.duration;
    this.currentAction=name;this.actionUntil=name==='idle'?0:this.actionStart+duration*1000;this.mount.dataset.action=name;
  }
  updateProcedural(now,dt) {
    if(this.procedural){
      const duration=(this.actionUntil-this.actionStart)/1000,time=Math.max(0,(now-this.actionStart)/1000);
      const weight=Math.min(1,time/.45,Math.max(0,(duration-time)/.55));
      this.natural.setGesture({action:{body:this.procedural},time,weight});
    }else this.natural.setGesture(undefined);
    this.natural.update(dt);this.recordArmPose();
  }
  recordArmPose(){
    this.mount.dataset.armLowering=(this.armReferences||[]).map(({node,rest})=>
      (node&&rest?THREE.MathUtils.radToDeg(node.quaternion.angleTo(rest)):0).toFixed(1)).join(',');
  }
  setSpeaking(value) {
    if(this.speaking===value)return;this.speaking=value;this.mount.dataset.speaking=String(value);
    if(value){const loop=CONFIG.speakingLoop;if(loop.length)this.play(loop[this.speakingIndex++%loop.length]);}
    else{this.play('idle');this.lastLoop=performance.now();}
  }
  reset() {
    this.loopIndex=0;this.speakingIndex=0;this.speaking=false;this.mount.dataset.speaking='false';
    this.lastLoop=performance.now()-CONFIG.loopSeconds*1000;this.actionUntil=0;
    this.controls?.reset();this.vrm?.expressionManager?.resetValues();this.play('idle');
  }
  disposeScene() {
    cancelAnimationFrame(this.frame);this.assetController?.abort();this.assetController=null;
    this.observer?.disconnect();this.controls?.dispose();this.mixer?.stopAllAction();
    if(this.model)VRMUtils.deepDispose(this.model);
    this.renderer?.dispose();this.natural=null;this.procedural=null;this.model=null;this.vrm=null;
    this.mixer=null;this.renderer=null;this.previous=null;this.controls=null;this.armReferences=null;
    delete this.mount.dataset.model;this.clips.clear();
  }
}
