/** @jest-environment node */
import { test, expect, jest } from '@jest/globals';
import { playQueuedSpeech, QueuedSpeech } from '../src/features/chat/playQueuedSpeech';
const job=():QueuedSpeech=>({audioBuffer:new ArrayBuffer(2),screenplay:{text:'[neutral] Plain sentence.',expression:'neutral',talk:{style:'talk',message:'Plain sentence.'}},streamIdx:1});
function callbacks(){return{isCurrent:()=>true,showText:jest.fn<(text:string)=>void>(),setSpeaking:jest.fn<(v:boolean)=>void>(),onError:jest.fn<(e:unknown)=>void>()}}
test('TTS/decode waiting never presents text; first audible callback presents it once',async()=>{
 const cb=callbacks();let start!:()=>void,finish!:()=>void;
 const speaker={speak:(_a:ArrayBuffer,_s:unknown,onAudible?:()=>void)=>{start=onAudible!;return new Promise<void>(r=>finish=r)}};
 const done=playQueuedSpeech(job(),{...cb,speaker});expect(cb.showText).not.toHaveBeenCalled();expect(cb.setSpeaking).not.toHaveBeenCalled();
 start();start();expect(cb.showText).toHaveBeenCalledTimes(1);expect(cb.showText).toHaveBeenCalledWith('[neutral] Plain sentence.');
 finish();await done;expect(cb.setSpeaking).toHaveBeenLastCalledWith(false);
});
test('cancelled stale playback cannot display a delayed sentence or clear a newer speaking state',async()=>{
 const cb=callbacks();let current=true,start!:()=>void,finish!:()=>void;
 const done=playQueuedSpeech(job(),{...cb,isCurrent:()=>current,speaker:{speak:(_a,_s,onAudible)=>{start=onAudible!;return new Promise<void>(r=>finish=r)}}});
 current=false;start();finish();await done;expect(cb.showText).not.toHaveBeenCalled();expect(cb.setSpeaking).not.toHaveBeenCalled();
});
test('text-only mode and failed speech remain readable',async()=>{
 const cb=callbacks();await playQueuedSpeech({...job(),audioBuffer:null},cb);expect(cb.showText).toHaveBeenCalledTimes(1);
 const failed=callbacks();await playQueuedSpeech(job(),{...failed,speaker:{speak:async()=>{throw new Error('decode failed')}}});expect(failed.showText).toHaveBeenCalledTimes(1);expect(failed.onError).toHaveBeenCalled();
});

test('streamed text already displayed is never appended again by audio playback', async () => {
 const cb=callbacks();let start!:()=>void,finish!:()=>void;
 const done=playQueuedSpeech({...job(),textAlreadyDisplayed:true},{...cb,speaker:{speak:(_a,_s,onAudible)=>{start=onAudible!;return new Promise<void>(r=>finish=r)}}});
 expect(cb.showText).not.toHaveBeenCalled();start();start();finish();await done;
 expect(cb.showText).not.toHaveBeenCalled();expect(cb.setSpeaking).toHaveBeenLastCalledWith(false);
});
