import {
  box,
  MotionType,
  rigidBody,
  type ContactSettings,
  type Listener,
  type RigidBody,
  type World,
} from "crashcat";
import type { Vec3 } from "mathcat";
import * as THREE from "three";
import { loadGltfScene } from "./util/kaykit";
import type { PhysicsLayers } from "./physics";

export type ConveyorModel = {
  model: THREE.Group;
  textures: THREE.Texture[];
};

type ConveyorUserData = {
  conveyorVelocity: Vec3;
};

const CONVEYOR_HALF_Y = 0.5;
const CONVEYOR_Y = -1;
const CONVEYOR_CENTER_Y = -0.5;
const CONVEYOR_TEXTURE_SCROLL_SPEED = 1.2;

export const CONVEYOR_HALF_X = 2.1;
export const CONVEYOR_SPEED = 6.0;
export const CONVEYOR_LONG_HALF_Z = 4;

export async function loadConveyorModel(path: string): Promise<ConveyorModel> {
  const model = await loadGltfScene(path);
  model.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });

  return {
    model,
    textures: cloneConveyorThreadTextures(model),
  };
}

export function addConveyorSegment(
  world: World,
  layers: PhysicsLayers,
  scene: THREE.Scene,
  model: THREE.Group,
  x: number,
  z: number,
  ry: number,
  halfZ: number,
  velocity: Vec3,
) {
  const object = model.clone(true);
  object.position.set(x, CONVEYOR_Y, z);
  object.rotation.y = ry;
  scene.add(object);

  rigidBody.create(world, {
    shape: box.create({ halfExtents: [CONVEYOR_HALF_X, CONVEYOR_HALF_Y, halfZ] }),
    motionType: MotionType.STATIC,
    objectLayer: layers.terrain,
    position: [x, CONVEYOR_CENTER_Y, z],
    quaternion: yawQuat(ry),
    friction: 2.8,
    restitution: 0.02,
    userData: { conveyorVelocity: velocity } satisfies ConveyorUserData,
  });
}

export function animateConveyorTextures(textures: THREE.Texture[], time: number) {
  const offset = (time * CONVEYOR_TEXTURE_SCROLL_SPEED) % 1;
  for (const texture of textures) {
    texture.offset.y = offset;
  }
}

export function createConveyorListener(): Listener {
  const applyConveyorContact = (bodyA: RigidBody, bodyB: RigidBody, _manifold: unknown, settings: ContactSettings) => {
    const velocityA = getConveyorVelocity(bodyA);
    const velocityB = getConveyorVelocity(bodyB);

    if (!velocityA && !velocityB) {
      return;
    }

    settings.combinedFriction = Math.max(settings.combinedFriction, 3.5);

    if (velocityA) {
      settings.relativeLinearSurfaceVelocity[0] -= velocityA[0];
      settings.relativeLinearSurfaceVelocity[1] -= velocityA[1];
      settings.relativeLinearSurfaceVelocity[2] -= velocityA[2];
    }
    if (velocityB) {
      settings.relativeLinearSurfaceVelocity[0] += velocityB[0];
      settings.relativeLinearSurfaceVelocity[1] += velocityB[1];
      settings.relativeLinearSurfaceVelocity[2] += velocityB[2];
    }
  };

  return {
    onContactAdded: applyConveyorContact,
    onContactPersisted: applyConveyorContact,
  };
}

function cloneConveyorThreadTextures(model: THREE.Group) {
  const textures: THREE.Texture[] = [];
  const clonedMaterials = new Map<THREE.Material, THREE.Material>();

  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) {
      return;
    }

    if (Array.isArray(node.material)) {
      node.material = node.material.map((material) => cloneConveyorThreadMaterial(material, clonedMaterials, textures));
      return;
    }

    node.material = cloneConveyorThreadMaterial(node.material, clonedMaterials, textures);
  });

  return textures;
}

function cloneConveyorThreadMaterial(
  material: THREE.Material,
  clonedMaterials: Map<THREE.Material, THREE.Material>,
  textures: THREE.Texture[],
) {
  if (material.name !== "threads") {
    return material;
  }

  const existing = clonedMaterials.get(material);
  if (existing) {
    return existing;
  }

  const cloned = material.clone();
  const texturedMaterial = cloned as THREE.Material & { map?: THREE.Texture | null };
  if (texturedMaterial.map) {
    texturedMaterial.map = texturedMaterial.map.clone();
    texturedMaterial.map.wrapS = THREE.RepeatWrapping;
    texturedMaterial.map.wrapT = THREE.RepeatWrapping;
    texturedMaterial.map.needsUpdate = true;
    textures.push(texturedMaterial.map);
  }
  texturedMaterial.needsUpdate = true;
  clonedMaterials.set(material, cloned);
  return cloned;
}

export function getConveyorVelocity(body: RigidBody): Vec3 | null {
  const userData = body.userData as Partial<ConveyorUserData> | null;
  return userData?.conveyorVelocity ?? null;
}

function yawQuat(yaw: number) {
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).toArray() as [number, number, number, number];
}
