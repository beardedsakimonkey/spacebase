import {
  box,
  ConstraintSpace,
  hingeConstraint,
  MotionType,
  MotorState,
  rigidBody,
  type RigidBody,
  type World,
} from "crashcat";
import type { Vec3 } from "mathcat";
import * as THREE from "three";
import type { PhysicsEntity, PhysicsLayers } from "./physics";

const SWIPER_BODY_KIND = "swiper";
const SWIPER_HALF_EXTENTS: Vec3 = [4.5, 0.75, 0.5];
const SWIPER_CENTER_Y = SWIPER_HALF_EXTENTS[1];

export const SWIPER_ANGULAR_SPEED = 2.6;

export type SwiperBodyUserData = {
  kind: typeof SWIPER_BODY_KIND;
};

export function isSwiperBody(body: RigidBody) {
  const userData = body.userData as Partial<SwiperBodyUserData> | null;
  return userData?.kind === SWIPER_BODY_KIND;
}

export function createSwiperBodyUserData(): SwiperBodyUserData {
  return { kind: SWIPER_BODY_KIND };
}

export function addSwiper(
  world: World,
  layers: PhysicsLayers,
  scene: THREE.Scene,
  entities: PhysicsEntity[],
  model: THREE.Group,
  x: number,
  z: number,
  targetAngularVelocity: number,
) {
  const object = new THREE.Group();
  const visual = model.clone(true);
  visual.position.y = -SWIPER_HALF_EXTENTS[1];
  object.add(visual);
  object.position.set(x, SWIPER_CENTER_Y, z);
  scene.add(object);

  const body = rigidBody.create(world, {
    shape: box.create({ halfExtents: SWIPER_HALF_EXTENTS, convexRadius: 0.05 }),
    motionType: MotionType.DYNAMIC,
    objectLayer: layers.kinematic,
    position: [x, SWIPER_CENTER_Y, z],
    friction: 0.85,
    restitution: 0.25,
    gravityFactor: 0,
    angularDamping: 0,
    allowSleeping: false,
    mass: 25,
    maxAngularVelocity: 12,
    userData: createSwiperBodyUserData(),
  });
  entities.push({ body, object });

  const anchor = rigidBody.create(world, {
    shape: box.create({ halfExtents: [0.1, 0.1, 0.1] }),
    motionType: MotionType.STATIC,
    objectLayer: layers.heldProp,
    position: [x, SWIPER_CENTER_Y, z],
  });

  const hinge = hingeConstraint.create(world, {
    bodyIdA: anchor.id,
    bodyIdB: body.id,
    pointA: [x, SWIPER_CENTER_Y, z],
    pointB: [x, SWIPER_CENTER_Y, z],
    hingeAxisA: [0, 1, 0],
    hingeAxisB: [0, 1, 0],
    normalAxisA: [1, 0, 0],
    normalAxisB: [1, 0, 0],
    space: ConstraintSpace.WORLD,
  });
  hingeConstraint.setMotorState(hinge, MotorState.VELOCITY);
  hingeConstraint.setTargetAngularVelocity(hinge, targetAngularVelocity);
}
