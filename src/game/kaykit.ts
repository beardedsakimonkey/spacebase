import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as THREE from "three";

const loader = new GLTFLoader();
const _m4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _yAxis = new THREE.Vector3(0, 1, 0);

export type GltfMesh = { geometry: THREE.BufferGeometry; material: THREE.Material };

export type TileTransform = { x: number; y: number; z: number; ry?: number };

export async function loadGltfScene(path: string): Promise<THREE.Group> {
  const gltf = await loader.loadAsync(path);
  return gltf.scene;
}

export async function loadGltfMesh(path: string): Promise<GltfMesh> {
  const gltf = await loader.loadAsync(path);
  let geometry: THREE.BufferGeometry | null = null;
  let material: THREE.Material | null = null;
  gltf.scene.traverse((node) => {
    if (!geometry && node instanceof THREE.Mesh) {
      geometry = node.geometry;
      material = node.material as THREE.Material;
    }
  });
  if (!geometry || !material) throw new Error(`No mesh found in ${path}`);
  return { geometry, material };
}

export function buildInstancedMesh(
  { geometry, material }: GltfMesh,
  tiles: TileTransform[],
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, tiles.length);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  for (let i = 0; i < tiles.length; i++) {
    const { x, y, z, ry = 0 } = tiles[i];
    _pos.set(x, y, z);
    _quat.setFromAxisAngle(_yAxis, ry);
    _m4.compose(_pos, _quat, _scale);
    mesh.setMatrixAt(i, _m4);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}
