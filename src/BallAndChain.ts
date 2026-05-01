import {
  box,
  ConstraintSpace,
  dof,
  MotionQuality,
  MotionType,
  pointConstraint,
  rigidBody,
  sphere,
  type World,
} from "crashcat";
import type { Quat, Vec3 } from "mathcat";
import * as THREE from "three";
import { platformerNeutralAsset } from "./assets";
import type { PhysicsEntity, PhysicsLayers } from "./physics";
import { loadGltfScene } from "./util/kaykit";

export type BallAndChainModels = {
  anchor: THREE.Group;
  chainLink: THREE.Group;
  spikeballHanger: THREE.Group;
};

const ANCHOR_POSITION: Vec3 = [0, 7.3, 0];
const ANCHOR_HALF_EXTENTS: Vec3 = [1, 0.1, 1];
const LINK_COUNT = 14;
const LINK_HALF_EXTENTS: Vec3 = [0.24, 0.34, 0.08];
const LINK_CENTER_SPACING = 0.48;
const LINK_JOINT_OFFSET = LINK_CENTER_SPACING * 0.5;
const LINK_ALLOWED_DEGREES_OF_FREEDOM = dof(true, true, true, true, false, true);
const SPIKEBALL_RADIUS = 1.2;
const SPIKEBALL_HANGER_ATTACHMENT_OFFSET = 1.5;
const SPIKEBALL_MASS = 9;
const INITIAL_SPIKEBALL_VELOCITY: Vec3 = [1.4, 0, -0.4];
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export async function loadBallAndChainModels(): Promise<BallAndChainModels> {
  const [anchor, chainLink, spikeballHanger] = await Promise.all([
    loadModel(platformerNeutralAsset("structure_A")),
    loadModel(platformerNeutralAsset("chain_link")),
    loadModel(platformerNeutralAsset("spikeball_hanger")),
  ]);

  return { anchor, chainLink, spikeballHanger };
}

export function addBallAndChain(
  world: World,
  layers: PhysicsLayers,
  scene: THREE.Scene,
  entities: PhysicsEntity[],
  models: BallAndChainModels,
) {
  const anchorBody = addAnchor(world, layers, scene, models.anchor);
  const links = addChainLinks(world, layers, scene, entities, models.chainLink);

  pointConstraint.create(world, {
    bodyIdA: anchorBody.id,
    bodyIdB: links[0].id,
    pointA: ANCHOR_POSITION,
    pointB: ANCHOR_POSITION,
    space: ConstraintSpace.WORLD,
    constraintPriority: 2,
    numVelocityStepsOverride: 4,
    numPositionStepsOverride: 4,
  });

  for (let i = 0; i < links.length - 1; i++) {
    const joint = getLinkJointPosition(i);
    pointConstraint.create(world, {
      bodyIdA: links[i].id,
      bodyIdB: links[i + 1].id,
      pointA: joint,
      pointB: joint,
      space: ConstraintSpace.WORLD,
      constraintPriority: 1,
      numVelocityStepsOverride: 4,
      numPositionStepsOverride: 4,
    });
  }

  const ballBody = addSpikeball(world, layers, scene, entities, models.spikeballHanger);
  const ballJoint = getSpikeballJointPosition();
  pointConstraint.create(world, {
    bodyIdA: links[links.length - 1].id,
    bodyIdB: ballBody.id,
    pointA: ballJoint,
    pointB: ballJoint,
    space: ConstraintSpace.WORLD,
    constraintPriority: 1,
    numVelocityStepsOverride: 5,
    numPositionStepsOverride: 5,
  });
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

function addAnchor(
  world: World,
  layers: PhysicsLayers,
  scene: THREE.Scene,
  model: THREE.Group,
) {
  const visual = model.clone(true);
  visual.position.set(
    ANCHOR_POSITION[0],
    ANCHOR_POSITION[1] + ANCHOR_HALF_EXTENTS[1],
    ANCHOR_POSITION[2],
  );
  scene.add(visual);

  return rigidBody.create(world, {
    shape: box.create({ halfExtents: ANCHOR_HALF_EXTENTS }),
    motionType: MotionType.STATIC,
    objectLayer: layers.terrain,
    position: [
      ANCHOR_POSITION[0],
      ANCHOR_POSITION[1] + ANCHOR_HALF_EXTENTS[1],
      ANCHOR_POSITION[2],
    ],
    friction: 0.85,
    restitution: 0.08,
  });
}

function addChainLinks(
  world: World,
  layers: PhysicsLayers,
  scene: THREE.Scene,
  entities: PhysicsEntity[],
  model: THREE.Group,
) {
  const links = [];
  for (let i = 0; i < LINK_COUNT; i++) {
    const position = getLinkPosition(i);
    const quaternion = getLinkQuaternion(i);
    const object = new THREE.Group();
    const visual = model.clone(true);
    object.add(visual);
    object.position.set(position[0], position[1], position[2]);
    object.quaternion.fromArray(quaternion);
    scene.add(object);

    const body = rigidBody.create(world, {
      shape: box.create({ halfExtents: LINK_HALF_EXTENTS, convexRadius: 0.035 }),
      motionType: MotionType.DYNAMIC,
      objectLayer: layers.kinematic,
      position,
      quaternion,
      friction: 0.65,
      restitution: 0.08,
      mass: 0.22,
      linearDamping: 0.06,
      angularDamping: 0.5,
      maxAngularVelocity: 5,
      allowedDegreesOfFreedom: LINK_ALLOWED_DEGREES_OF_FREEDOM,
      motionQuality: MotionQuality.LINEAR_CAST,
    });
    entities.push({ body, object });
    links.push(body);
  }
  return links;
}

function addSpikeball(
  world: World,
  layers: PhysicsLayers,
  scene: THREE.Scene,
  entities: PhysicsEntity[],
  model: THREE.Group,
) {
  const position = getSpikeballPosition();
  const object = new THREE.Group();
  const visual = model.clone(true);
  object.add(visual);
  object.position.set(position[0], position[1], position[2]);
  scene.add(object);

  const body = rigidBody.create(world, {
    shape: sphere.create({ radius: SPIKEBALL_RADIUS }),
    motionType: MotionType.DYNAMIC,
    objectLayer: layers.props,
    position,
    friction: 0.9,
    restitution: 0.35,
    mass: SPIKEBALL_MASS,
    linearDamping: 0.02,
    angularDamping: 0.08,
    motionQuality: MotionQuality.LINEAR_CAST,
  });
  rigidBody.setLinearVelocity(world, body, INITIAL_SPIKEBALL_VELOCITY);
  entities.push({ body, object });
  return body;
}

function getLinkPosition(index: number): Vec3 {
  return [
    ANCHOR_POSITION[0],
    ANCHOR_POSITION[1] - LINK_JOINT_OFFSET - LINK_CENTER_SPACING * index,
    ANCHOR_POSITION[2],
  ];
}

function getLinkJointPosition(index: number): Vec3 {
  const linkPosition = getLinkPosition(index);
  return [
    linkPosition[0],
    linkPosition[1] - LINK_JOINT_OFFSET,
    linkPosition[2],
  ];
}

function getSpikeballJointPosition(): Vec3 {
  const lastLink = getLinkPosition(LINK_COUNT - 1);
  return [
    lastLink[0],
    lastLink[1] - LINK_JOINT_OFFSET,
    lastLink[2],
  ];
}

function getSpikeballPosition(): Vec3 {
  const joint = getSpikeballJointPosition();
  return [
    joint[0],
    joint[1] - SPIKEBALL_HANGER_ATTACHMENT_OFFSET,
    joint[2],
  ];
}

function getLinkQuaternion(index: number): Quat {
  const quaternion = new THREE.Quaternion().setFromAxisAngle(
    Y_AXIS,
    index % 2 === 0 ? 0 : Math.PI * 0.5,
  );
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}
