import {
  box,
  MotionQuality,
  MotionType,
  rigidBody,
  type World,
} from "crashcat";
import type { Quat, Vec3 } from "mathcat";
import * as THREE from "three";
import { platformerNeutralAsset, type PlatformerNeutralModel } from "./assets";
import type { PhysicsEntity, PhysicsLayers } from "./physics";
import { loadGltfScene } from "./util/kaykit";

type ModelTransform = {
  x: number;
  y: number;
  z: number;
  rx?: number;
  ry?: number;
  rz?: number;
  scale?: number;
};

export type ScatteredPropPlacement = ModelTransform & {
  model: PlatformerNeutralModel;
  halfExtents: Vec3;
  dynamic?: boolean;
  friction?: number;
  restitution?: number;
  mass?: number;
  linearDamping?: number;
  angularDamping?: number;
};

export type ScatteredPropModels = Map<PlatformerNeutralModel, THREE.Group>;

const FLOOR_TOP = 0;
const SECOND_STORY_TOP = 4;

export const SCATTERED_PROPS: ScatteredPropPlacement[] = [
  {
    model: "cone",
    x: -15.5,
    y: FLOOR_TOP,
    z: -33,
    ry: 0.4,
    halfExtents: [0.28, 0.33, 0.28],
    dynamic: true,
    friction: 0.9,
    restitution: 0.18,
    mass: 0.25,
    linearDamping: 0.08,
    angularDamping: 0.18,
  },
  {
    model: "sign",
    x: 16.2,
    y: FLOOR_TOP,
    z: -29,
    ry: -0.7,
    halfExtents: [0.4, 0.65, 0.4],
    dynamic: true,
    friction: 0.85,
    restitution: 0.12,
    mass: 0.65,
    linearDamping: 0.08,
    angularDamping: 0.18,
  },
  {
    model: "platform_wood_1x1x1",
    x: -12,
    y: SECOND_STORY_TOP,
    z: 34,
    ry: 0.25,
    halfExtents: [0.5, 0.5, 0.5],
    dynamic: true,
    friction: 1.25,
    restitution: 0.06,
    mass: 1.1,
    linearDamping: 0.04,
    angularDamping: 0.12,
  },
  {
    model: "signage_arrows_right",
    x: -8.5,
    y: FLOOR_TOP,
    z: -41.5,
    ry: 0.08,
    halfExtents: [2.7, 0.75, 0.36],
    friction: 0.85,
    restitution: 0.1,
  },
  {
    model: "signage_arrows_left",
    x: 8.5,
    y: FLOOR_TOP,
    z: 41.5,
    ry: Math.PI - 0.08,
    halfExtents: [2.7, 0.75, 0.36],
    friction: 0.85,
    restitution: 0.1,
  },
];

export async function loadScatteredPropModels(
  placements: readonly ScatteredPropPlacement[] = SCATTERED_PROPS,
): Promise<ScatteredPropModels> {
  const models: ScatteredPropModels = new Map();
  const modelNames = [...new Set(placements.map((placement) => placement.model))];

  await Promise.all(
    modelNames.map(async (modelName) => {
      models.set(modelName, await loadModel(platformerNeutralAsset(modelName)));
    }),
  );

  return models;
}

export function addScatteredProps(
  world: World,
  layers: PhysicsLayers,
  scene: THREE.Scene,
  entities: PhysicsEntity[],
  models: ScatteredPropModels,
  placements: readonly ScatteredPropPlacement[] = SCATTERED_PROPS,
) {
  for (const placement of placements) {
    const model = models.get(placement.model);
    if (!model) {
      throw new Error(`Missing scattered prop model: ${placement.model}`);
    }
    addScatteredProp(world, layers, scene, entities, model, placement);
  }
}

async function loadModel(path: string) {
  const model = await loadGltfScene(path);
  model.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  return model;
}

function addScatteredProp(
  world: World,
  layers: PhysicsLayers,
  scene: THREE.Scene,
  entities: PhysicsEntity[],
  model: THREE.Group,
  placement: ScatteredPropPlacement,
) {
  if (placement.dynamic) {
    addDynamicProp(world, layers, scene, entities, model, placement);
    return;
  }

  addStaticProp(world, layers, scene, model, placement);
}

function addDynamicProp(
  world: World,
  layers: PhysicsLayers,
  scene: THREE.Scene,
  entities: PhysicsEntity[],
  model: THREE.Group,
  placement: ScatteredPropPlacement,
) {
  const object = new THREE.Group();
  const visual = model.clone(true);
  const bodyY = placement.y + placement.halfExtents[1];

  visual.position.y = -placement.halfExtents[1];
  if (placement.scale !== undefined) {
    visual.scale.setScalar(placement.scale);
  }

  object.position.set(placement.x, bodyY, placement.z);
  object.quaternion.fromArray(placementQuaternion(placement));
  object.add(visual);
  scene.add(object);

  const body = rigidBody.create(world, {
    shape: box.create({ halfExtents: placement.halfExtents, convexRadius: 0.03 }),
    motionType: MotionType.DYNAMIC,
    objectLayer: layers.props,
    position: [placement.x, bodyY, placement.z],
    quaternion: placementQuaternion(placement),
    friction: placement.friction ?? 1,
    restitution: placement.restitution ?? 0.08,
    mass: placement.mass ?? 1,
    linearDamping: placement.linearDamping ?? 0.04,
    angularDamping: placement.angularDamping ?? 0.15,
    motionQuality: MotionQuality.LINEAR_CAST,
  });
  entities.push({ body, object });
}

function addStaticProp(
  world: World,
  layers: PhysicsLayers,
  scene: THREE.Scene,
  model: THREE.Group,
  placement: ScatteredPropPlacement,
) {
  const object = model.clone(true);
  object.position.set(placement.x, placement.y, placement.z);
  object.quaternion.fromArray(placementQuaternion(placement));
  if (placement.scale !== undefined) {
    object.scale.setScalar(placement.scale);
  }
  scene.add(object);

  rigidBody.create(world, {
    shape: box.create({ halfExtents: placement.halfExtents }),
    motionType: MotionType.STATIC,
    objectLayer: layers.terrain,
    position: [
      placement.x,
      placement.y + placement.halfExtents[1],
      placement.z,
    ],
    quaternion: placementQuaternion(placement),
    friction: placement.friction ?? 1,
    restitution: placement.restitution ?? 0.08,
  });
}

function placementQuaternion(placement: Pick<ModelTransform, "rx" | "ry" | "rz">): Quat {
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(placement.rx ?? 0, placement.ry ?? 0, placement.rz ?? 0),
  );
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}
