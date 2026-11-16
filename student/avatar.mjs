import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';
import { CONFIG } from './config.mjs';
import { NaturalMotion } from '../src/features/avatarMotion/naturalMotion.ts';

export class AvatarStage {
  constructor(mount, status) {
    this.mount=mount; this.status=status; this.mode=''; this.revision=0; this.clips=new Map();
    this.frame=0; this.loopIndex=0; this.speakingIndex=0; this.speaking=false; this.lastLoop=0; this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  async show(mode) {
    if (mode===this.mode) { this.reset(); return; }
    this.mode=mode; const revision=++this.revision; this.disposeScene();
    this.mount.replaceChildren();
    if (mode==='scholar') {
      const frame=document.createElement('iframe');
      frame.src=CONFIG.scholarPreview; frame.title='古代文士 3D 外觀預覽（外部模型，尚未接駁骨架動作）';
      frame.allow='fullscreen'; frame.referrerPolicy='no-referrer'; this.mount.append(frame);
      this.status.textContent='外部 3D 預覽 · 尚未下載及接駁角色動作';
      return;
    }
    this.status.textContent='正在載入校服角色⋯';
    try {
      const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
      this.renderer=renderer; renderer.setPixelRatio(Math.min(devicePixelRatio,2));
      renderer.outputColorSpace=THREE.SRGBColorSpace; this.mount.append(renderer.domElement);
      const scene=new THREE.Scene(); this.scene=scene;
      this.camera=new THREE.PerspectiveCamera(30,1,.01,100);
      scene.add(new THREE.HemisphereLight(0xffffff,0x91a38d,2.4));
      const key=new THREE.DirectionalLight(0xfff4df,2.2); key.position.set(1,2,3); scene.add(key);
      const fill=new THREE.DirectionalLight(0xffffff,1); fill.position.set(-2,1,-1); scene.add(fill);
      this.controls=new OrbitControls(this.camera,renderer.domElement);
      this.controls.enablePan=false; this.controls.minDistance=.8; this.controls.maxDistance=7;
      this.controls.minPolarAngle=.35; this.controls.maxPolarAngle=Math.PI*.65;
      const resize=()=>{if(!this.renderer)return;const w=this.mount.clientWidth,h=this.mount.clientHeight;renderer.setSize(w,h);this.camera.aspect=w/Math.max(1,h);this.camera.updateProjectionMatrix();};
      this.observer=new ResizeObserver(resize);this.observer.observe(this.mount);resize();
      const loader=new GLTFLoader(); loader.register(parser=>new VRMLoaderPlugin(parser));
      const gltf=await loader.loadAsync(CONFIG.schoolModel);
      if(revision!==this.revision){VRMUtils.deepDispose(gltf.scene);return;}
      const vrm=gltf.userData.vrm;
      if(!vrm)throw new Error('Invalid VRM');
      this.vrm=vrm;VRMUtils.rotateVRM0(vrm);scene.add(vrm.scene);
      this.natural=new NaturalMotion(vrm,.5);this.rootBase=vrm.scene.quaternion.clone();
      const box=new THREE.Box3().setFromObject(vrm.scene);
      const height=box.max.y-box.min.y;this.targetY=box.min.y+height*.53;
      this.camera.position.set(0,this.targetY,height*2.15);
      this.controls.target.set(0,this.targetY,0);this.controls.update();this.controls.saveState();
      this.mixer=new THREE.AnimationMixer(vrm.scene);
      const animationLoader=new GLTFLoader();animationLoader.register(parser=>new VRMAnimationLoaderPlugin(parser));
      const loaded=await Promise.allSettled(Object.entries(CONFIG.actions).map(async([name,url])=>{
        const data=await animationLoader.loadAsync(url);
        if(revision!==this.revision)return;
        const animation=data.userData.vrmAnimations?.[0];
        if(animation)this.clips.set(name,createVRMAnimationClip(animation,vrm));
      }));
      if(revision!==this.revision)return;
      this.status.textContent=loaded.some(r=>r.status==='rejected')?'角色已載入 · 部分動作未能載入':'';
      this.play('idle');this.mixer.update(1/60);vrm.update(1/60);this.lastLoop=performance.now()-CONFIG.loopSeconds*1000;
      const clock=new THREE.Clock();
      const tick=()=>{
        if(revision!==this.revision)return;
        this.frame=requestAnimationFrame(tick);
        const dt=Math.min(clock.getDelta(),.05),time=performance.now()/1000;
        if(!this.reduced) {
          this.natural.prepareFrame();this.mixer.update(dt);
          this.updateProcedural(performance.now(),dt);
          // Blink uses the VRM expression manager, never speech or audio.
          const blink=Math.max(0,1-Math.abs((time%4.7)-.12)/.1);
          vrm.expressionManager?.setValue('blink',blink);
          const now=performance.now();
          if(now>=this.actionUntil) {
            if(this.speaking) {
              const loop=CONFIG.speakingLoop;
              if(loop.length)this.play(loop[this.speakingIndex++%loop.length]);
            } else {
              if(this.currentAction!=='idle')this.play('idle');
              if(now-this.lastLoop>=CONFIG.loopSeconds*1000){
                this.lastLoop=now;const loop=CONFIG.idleLoop;
                if(loop.length)this.play(loop[this.loopIndex++%loop.length]);
              }
            }
          }
          vrm.update(dt);
        }
        this.controls.update();renderer.render(scene,this.camera);
      }; tick();
    } catch(error) {
      if(revision===this.revision)this.status.textContent='3D 載入失敗。請重新整理，或檢查瀏覽器是否支援 WebGL。文字對話仍可使用。';
    }
  }
  play(name) {
    if((this.reduced&&name!=='idle')||!this.mixer||!this.vrm)return;
    if(this.rootBase)this.vrm.scene.quaternion.copy(this.rootBase);
    const procedural={greeting:'greeting',explain:'explanation',emphasis:'emphasis'}[name];
    const clip=this.clips.get(name)||this.clips.get('idle'); if(!clip)return;
    const action=this.mixer.clipAction(clip);
    if(this.previous!==action){action.reset().fadeIn(.35).play();this.previous?.fadeOut(.35);this.previous=action;}
    else action.reset().play();
    this.procedural=procedural;this.actionStart=performance.now();
    const duration=procedural?(name==='emphasis'?2.8:3.8):name==='spin'?4.5:clip.duration;
    this.currentAction=name;this.actionUntil=name==='idle'?0:this.actionStart+duration*1000;
    this.mount.dataset.action=name;
  }
  updateProcedural(now,dt) {
    if(!this.vrm)return;
    if(this.currentAction==='spin'){
      const t=Math.max(0,Math.min(1,(now-this.actionStart)/4500));
      const eased=t*t*(3-2*t);
      this.vrm.scene.quaternion.copy(this.rootBase).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI*2*eased));
    }
    if(this.procedural){
      const duration=(this.actionUntil-this.actionStart)/1000;
      const time=Math.max(0,(now-this.actionStart)/1000);
      const weight=Math.min(1,time/.45,Math.max(0,(duration-time)/.55));
      this.natural.setGesture({action:{body:this.procedural},time,weight});
      this.natural.update(dt);
    }
  }
  setSpeaking(value) {
    if(this.speaking===value)return;
    this.speaking=value;this.mount.dataset.speaking=String(value);
    if(value){
      const loop=CONFIG.speakingLoop;
      if(loop.length)this.play(loop[this.speakingIndex++%loop.length]);
    }else{this.play('idle');this.lastLoop=performance.now();}
  }
  reset() {
    this.loopIndex=0;this.speakingIndex=0;this.speaking=false;
    this.mount.dataset.speaking='false';
    this.lastLoop=performance.now()-CONFIG.loopSeconds*1000;this.actionUntil=0;
    this.controls?.reset();this.vrm?.expressionManager?.resetValues();this.play('idle');
  }
  disposeScene() {
    cancelAnimationFrame(this.frame);this.observer?.disconnect();this.controls?.dispose();
    this.mixer?.stopAllAction();this.natural=null;this.procedural=null;if(this.vrm)VRMUtils.deepDispose(this.vrm.scene);
    this.renderer?.dispose();this.vrm=null;this.mixer=null;this.renderer=null;this.previous=null;
    this.clips.clear();
  }
}
