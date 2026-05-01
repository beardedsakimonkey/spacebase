import {
  box,
  compound,
  ConstraintSpace,
  cylinder,
  hingeConstraint,
  MotionQuality,
  MotionType,
  MotorState,
  rigidBody,
  type World,
} from "crashcat";
import type { Vec3 } from "mathcat";
import * as THREE from "three";
import type { PhysicsEntity, PhysicsLayers } from "./physics";

const SAW_TRAP_BASE_HALF_EXTENTS: Vec3 = [1.42, 1, 3.92];
const SAW_TRAP_BASE_OFFSET: Vec3 = [0, 0, 2.5];
const SAW_TRAP_BLADE_OFFSET: Vec3 = [0, 0, 5];
const SAW_TRAP_BLADE_RADIUS = 3.4;
const SAW_TRAP_BLADE_HALF_HEIGHT = 0.45;
const SAW_TRAP_CENTER_Y = 1;
const SAW_TRAP_BLADE_SPIN_SPEED = 12;

export const SAW_TRAP_ROTATION_SPEED = -0.9;

export function spinSawTrapBlades(blades: THREE.Object3D[], dt: number) {
  for (const blade of blades) {
    blade.rotateY(SAW_TRAP_BLADE_SPIN_SPEED * dt);
  }
}

export function addRotatingSawTrap(
  world: World,
  layers: PhysicsLayers,
  scene: THREE.Scene,
  entities: PhysicsEntity[],
  model: THREE.Group,
  animatedBlades: THREE.Object3D[],
  x: number,
  z: number,
  targetAngularVelocity: number,
) {
  const object = new THREE.Group();
  const visual = model.clone(true);
  visual.traverse((node) => {
    if (node.name.includes("sawblade")) {
      animatedBlades.push(node);
    }
  });
  object.add(visual);
  object.position.set(x, SAW_TRAP_CENTER_Y, z);
  scene.add(object);

  const body = rigidBody.create(world, {
    shape: compound.create({
      children: [
        {
          shape: box.create({ halfExtents: SAW_TRAP_BASE_HALF_EXTENTS, convexRadius: 0.04 }),
          position: SAW_TRAP_BASE_OFFSET,
          quaternion: [0, 0, 0, 1],
        },
        {
          shape: cylinder.create({
            radius: SAW_TRAP_BLADE_RADIUS,
            halfHeight: SAW_TRAP_BLADE_HALF_HEIGHT,
            convexRadius: 0.04,
          }),
          position: SAW_TRAP_BLADE_OFFSET,
          quaternion: [0, 0, 0, 1],
        },
      ],
    }),
    motionType: MotionType.DYNAMIC,
    objectLayer: layers.kinematic,
    position: [x, SAW_TRAP_CENTER_Y, z],
    friction: 0.9,
    restitution: 0.18,
    gravityFactor: 0,
    angularDamping: 0,
    allowSleeping: false,
    mass: 40,
    maxAngularVelocity: 8,
    motionQuality: MotionQuality.LINEAR_CAST,
  });
  entities.push({ body, object });

  const anchor = rigidBody.create(world, {
    shape: box.create({ halfExtents: [0.1, 0.1, 0.1] }),
    motionType: MotionType.STATIC,
    objectLayer: layers.heldProp,
    position: [x, SAW_TRAP_CENTER_Y, z],
  });

  const hinge = hingeConstraint.create(world, {
    bodyIdA: anchor.id,
    bodyIdB: body.id,
    pointA: [x, SAW_TRAP_CENTER_Y, z],
    pointB: [x, SAW_TRAP_CENTER_Y, z],
    hingeAxisA: [0, 1, 0],
    hingeAxisB: [0, 1, 0],
    normalAxisA: [1, 0, 0],
    normalAxisB: [1, 0, 0],
    space: ConstraintSpace.WORLD,
  });
  hingeConstraint.setMotorState(hinge, MotorState.VELOCITY);
  hingeConstraint.setTargetAngularVelocity(hinge, targetAngularVelocity);
}
