import { CONFIG } from './config.mjs';

// Display rendered animation only. The separately licensed mesh never ships to browsers.
export class RenderedScholar {
  constructor(mount,status,reduced) {
    this.mount=mount;this.status=status;this.reduced=reduced;this.active=true;
    this.image=document.createElement('img');this.image.className='scholar-animation';
    this.image.alt='古代文士，固定視角動畫';this.image.width=480;this.image.height=720;
    this.image.onload=()=>{if(this.active)this.status.textContent='';};
    this.image.onerror=()=>{if(this.active)this.status.textContent='角色動畫未能載入。請重新整理；文字對話仍可使用。';};
    this.mount.append(this.image);this.status.textContent='正在載入古代文士動畫⋯';
    this.reset();
    if(!reduced)this.timer=setInterval(()=>this.tick(),100);
  }
  play(name) {
    if(this.reduced&&name!=='idle')return;
    const action=CONFIG.scholarActions[name]||CONFIG.scholarActions.idle;
    const source=this.reduced?CONFIG.scholarStill:action.file;
    if(this.image.getAttribute('src')!==source)this.image.src=source;
    this.currentAction=name;this.mount.dataset.action=name;
    this.actionUntil=name==='idle'?0:performance.now()+action.seconds*1000;
  }
  tick() {
    const now=performance.now();if(now<this.actionUntil)return;
    if(this.speaking){
      const loop=CONFIG.speakingLoop;if(loop.length)this.play(loop[this.speakingIndex++%loop.length]);
    }else{
      if(this.currentAction!=='idle')this.play('idle');
      if(now-this.lastLoop>=CONFIG.loopSeconds*1000){
        this.lastLoop=now;const loop=CONFIG.idleLoop;if(loop.length)this.play(loop[this.loopIndex++%loop.length]);
      }
    }
  }
  setSpeaking(value) {
    if(this.speaking===value)return;
    this.speaking=value;this.mount.dataset.speaking=String(value);
    if(value){const loop=CONFIG.speakingLoop;if(loop.length)this.play(loop[this.speakingIndex++%loop.length]);}
    else{this.play('idle');this.lastLoop=performance.now();}
  }
  reset() {
    this.loopIndex=0;this.speakingIndex=0;this.speaking=false;
    this.mount.dataset.speaking='false';
    this.lastLoop=performance.now()-CONFIG.loopSeconds*1000;this.play('idle');
  }
  dispose() {
    this.active=false;clearInterval(this.timer);this.image.onload=null;this.image.onerror=null;
  }
}
