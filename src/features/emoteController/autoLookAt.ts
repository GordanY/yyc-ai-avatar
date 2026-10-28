import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';

export class AutoLookAt {
  private target = new THREE.Object3D();
  private elapsed = Math.random() * 20;
  private untilShift = 5 + Math.random() * 6;
  private destination = new THREE.Vector3();
  constructor(private vrm: VRM, private camera: THREE.Object3D) {
    camera.add(this.target);
    if (vrm.lookAt) vrm.lookAt.target = this.target;
  }
  update(delta: number) {
    this.elapsed += delta; this.untilShift -= delta;
    if (this.untilShift <= 0) {
      this.destination.set((Math.random() - .5) * .09, (Math.random() - .5) * .05, 0);
      this.untilShift = 6 + Math.random() * 9;
    }
    this.target.position.lerp(this.destination, 1 - Math.exp(-delta * 2));
  }
  dispose() { this.camera.remove(this.target); if (this.vrm.lookAt?.target === this.target) this.vrm.lookAt.target = undefined; }
}
