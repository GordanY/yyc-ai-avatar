/** @jest-environment node */
import { test, expect } from '@jest/globals';
import * as THREE from 'three';
import { ElbowCloth } from '../src/features/avatarMotion/elbowCloth';

function fixture() {
  const root = new THREE.Object3D(), nodes: Record<string, THREE.Object3D> = {};
  const add = (name: string, parent: THREE.Object3D, x: number) => { const node = new THREE.Object3D(); node.position.x = x; parent.add(node); nodes[name] = node; return node; };
  const upper = add('rightUpperArm', root, .12), elbow = add('rightLowerArm', upper, .215); add('rightHand', elbow, .273);
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  mesh.userData.yycElbowCloth = { side: 'right', u: [0, -1, 0], v: [0, 0, -1], startDegrees: 45, fullDegrees: 125 };
  mesh.morphTargetInfluences = [0, 0, 0, 0, .42];
  mesh.morphTargetDictionary = Object.fromEntries([0, 1, 2, 3].map(i => ['YYC_ElbowFold_' + i, i])); root.add(mesh);
  const vrm = { scene: root, humanoid: { getNormalizedBoneNode: (name: string) => nodes[name] } } as any;
  return { root, nodes, upper, elbow, mesh, cloth: new ElbowCloth(vrm) };
}

test('a tight elbow activates inner-cuff folds and straightening releases them immediately', () => {
  const f = fixture(); f.cloth.update(); expect(f.mesh.morphTargetInfluences!.slice(0, 4)).toEqual([0, 0, 0, 0]);
  f.elbow.rotation.z = THREE.MathUtils.degToRad(138); f.cloth.update();
  expect(f.mesh.morphTargetInfluences![2]).toBeCloseTo(1); expect(f.mesh.morphTargetInfluences![4]).toBe(.42);
  f.elbow.rotation.z = 0; f.cloth.update(); expect(f.mesh.morphTargetInfluences!.slice(0, 4)).toEqual([0, 0, 0, 0]);
});

test('fold direction follows the forearm in upper-arm space, independent of whole-avatar rotation', () => {
  const f = fixture(); f.elbow.rotation.set(0, -.4, 2.2); f.cloth.update(); const before = f.mesh.morphTargetInfluences!.slice();
  f.root.rotation.set(.3, 1.2, -.7); f.upper.rotation.set(.2, -.3, -1.1); f.cloth.update();
  f.mesh.morphTargetInfluences!.forEach((weight, i) => expect(weight).toBeCloseTo(before[i], 10));
  expect(before.slice(0, 4).filter(weight => weight > .001)).toHaveLength(2);
});

test('cloth correction leaves every bone transform and unrelated morph untouched', () => {
  const f = fixture(); f.elbow.rotation.z = 2.4; const pose = Object.fromEntries(Object.entries(f.nodes).map(([name, bone]) => [name, bone.quaternion.clone()]));
  f.cloth.update(); for (const [name, bone] of Object.entries(f.nodes)) expect(bone.quaternion.angleTo(pose[name])).toBe(0);
  expect(f.mesh.morphTargetInfluences![4]).toBe(.42);
});
