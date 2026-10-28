import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';

const smooth = (value: number) => { const t = THREE.MathUtils.clamp(value, 0, 1); return t * t * (3 - 2 * t); };
type Cuff = { mesh: THREE.SkinnedMesh; side: 'left' | 'right'; u: THREE.Vector3; v: THREE.Vector3; indices: number[]; start: number; full: number; lastAngle: number };

/** Pose-space cuff folds. Read the final arm pose, including native clips,
 * and compress the inner cuff before it intersects the returning forearm.
 * No bone transforms or facial morphs are changed. */
export class ElbowCloth {
  private cuffs: Cuff[] = [];
  private upperPosition = new THREE.Vector3();
  private elbowPosition = new THREE.Vector3();
  private handPosition = new THREE.Vector3();
  private upperDirection = new THREE.Vector3();
  private forearmDirection = new THREE.Vector3();
  private bendDirection = new THREE.Vector3();
  private inverseUpperRotation = new THREE.Quaternion();
  constructor(private vrm: VRM) {
    vrm.scene.traverse(object => {
      const mesh = object as THREE.SkinnedMesh;
      const metadata = mesh.userData.yycElbowCloth;
      if (!mesh.isSkinnedMesh || !mesh.morphTargetInfluences || !metadata || !['left', 'right'].includes(metadata.side)) return;
      const indices = [0, 1, 2, 3].map(index => mesh.morphTargetDictionary?.['YYC_ElbowFold_' + index]);
      if (indices.some(index => index === undefined)) return;
      this.cuffs.push({ mesh, side: metadata.side, u: new THREE.Vector3().fromArray(metadata.u), v: new THREE.Vector3().fromArray(metadata.v),
        indices: indices as number[], start: metadata.startDegrees, full: metadata.fullDegrees, lastAngle: 0 });
    });
  }

  update() {
    for (const cuff of this.cuffs) {
      const upper = this.vrm.humanoid.getNormalizedBoneNode(cuff.side === 'left' ? 'leftUpperArm' : 'rightUpperArm');
      const elbow = this.vrm.humanoid.getNormalizedBoneNode(cuff.side === 'left' ? 'leftLowerArm' : 'rightLowerArm');
      const hand = this.vrm.humanoid.getNormalizedBoneNode(cuff.side === 'left' ? 'leftHand' : 'rightHand');
      if (!upper || !elbow || !hand) continue;
      upper.getWorldPosition(this.upperPosition); elbow.getWorldPosition(this.elbowPosition); hand.getWorldPosition(this.handPosition);
      this.upperDirection.subVectors(this.elbowPosition, this.upperPosition).normalize();
      this.forearmDirection.subVectors(this.handPosition, this.elbowPosition).normalize();
      const dot = THREE.MathUtils.clamp(this.upperDirection.dot(this.forearmDirection), -1, 1);
      const degrees = THREE.MathUtils.radToDeg(Math.acos(dot));
      const amount = smooth((degrees - cuff.start) / (cuff.full - cuff.start));
      const values = cuff.mesh.morphTargetInfluences!;
      for (const index of cuff.indices) values[index] = 0;
      if (amount === 0) continue;
      this.bendDirection.copy(this.forearmDirection).addScaledVector(this.upperDirection, -dot);
      if (this.bendDirection.lengthSq() > 1e-8) {
        upper.getWorldQuaternion(this.inverseUpperRotation).invert();
        this.bendDirection.applyQuaternion(this.inverseUpperRotation).normalize();
        cuff.lastAngle = Math.atan2(this.bendDirection.dot(cuff.v), this.bendDirection.dot(cuff.u));
      }
      const phase = ((cuff.lastAngle / (Math.PI / 2)) % 4 + 4) % 4;
      const index = Math.floor(phase), blend = phase - index;
      values[cuff.indices[index]] = amount * (1 - blend);
      values[cuff.indices[(index + 1) % 4]] = amount * blend;
    }
  }
}
