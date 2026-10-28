import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { loadVRMAnimation } from '@/lib/VRMAnimation/loadVRMAnimation';
import { GestureAction } from './gestureCatalog';
import { GestureFrame } from './gestureScheduler';

type Track = { node: THREE.Object3D; property: 'quaternion' | 'position'; interpolant: THREE.Interpolant };
type Saved = { node: THREE.Object3D; quaternion: THREE.Quaternion; position: THREE.Vector3 };

/** Retarget locally supplied clips on top of the presenter's pose. No mixer
 * ownership changes, and every touched transform is restored before next frame. */
export class GestureClipLayer {
  private clips = new Map<string, Track[]>();
  private loading = new Map<string, Promise<void>>();
  private saved: Saved[] = [];
  private quaternion = new THREE.Quaternion();
  private position = new THREE.Vector3();
  constructor(private vrm: VRM) {}
  isReady = (action: GestureAction) => !action.clipUrl || this.clips.has(action.id);
  prepareFrame() {
    for (const state of this.saved) { state.node.quaternion.copy(state.quaternion); state.node.position.copy(state.position); }
    this.saved = [];
  }
  load(action: GestureAction) {
    if (this.isReady(action)) return Promise.resolve();
    const existing = this.loading.get(action.id); if (existing) return existing;
    const promise = (async () => {
      const animation = await loadVRMAnimation(action.clipUrl!);
      if (!animation) throw new Error('This motion has no VRM animation.');
      const nodes = new Map<string, THREE.Object3D>();
      for (const bone of Object.keys(this.vrm.humanoid.normalizedHumanBones)) {
        const node = this.vrm.humanoid.getNormalizedBoneNode(bone as VRMHumanBoneName);
        if (node) nodes.set(node.name, node);
      }
      const tracks: Track[] = [];
      for (const track of animation.createAnimationClip(this.vrm).tracks) {
        const match = track.name.match(/^(.*)\.(quaternion|position)$/);
        const node = match && nodes.get(match[1]);
        if (node && match) tracks.push({ node, property: match[2] as Track['property'], interpolant: (track as THREE.KeyframeTrack & { createInterpolant: () => THREE.Interpolant }).createInterpolant() });
      }
      if (!tracks.length) throw new Error('This motion has no compatible body tracks.');
      action.duration = animation.duration + .9;
      this.clips.set(action.id, tracks);
    })().finally(() => this.loading.delete(action.id));
    this.loading.set(action.id, promise); return promise;
  }
  apply(frame?: GestureFrame) {
    if (!frame?.action.clipUrl || frame.weight <= 0) return;
    const tracks = this.clips.get(frame.action.id); if (!tracks) return;
    const saved = new Set<THREE.Object3D>();
    for (const track of tracks) {
      if (!saved.has(track.node)) { this.saved.push({ node: track.node, quaternion: track.node.quaternion.clone(), position: track.node.position.clone() }); saved.add(track.node); }
      const value = track.interpolant.evaluate(Math.max(0, frame.time - .45));
      if (track.property === 'quaternion') track.node.quaternion.slerp(this.quaternion.fromArray(value), frame.weight);
      else track.node.position.lerp(this.position.fromArray(value), frame.weight);
    }
  }
}
