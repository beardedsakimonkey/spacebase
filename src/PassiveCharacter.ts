import {
  capsule,
  dof,
  MaterialCombineMode,
  MotionQuality,
  MotionType,
  offsetCenterOfMass,
  rigidBody,
  type RigidBody,
  type World,
} from "crashcat";
import type { Vec3 } from "mathcat";
import * as THREE from "three";
import { PlayerAnimator } from "./PlayerAnimator";
import type { PhysicsLayers } from "./physics";
import type { MannequinBodyColor } from "./util/mannequin";

const CAPSULE_RADIUS = 0.58;
const CAPSULE_HALF_HEIGHT = 0.51;
const PASSIVE_CHARACTER_CENTER_OF_MASS_OFFSET: Vec3 = [0, -0.28, 0];
const PASSIVE_CHARACTER_ALLOWED_DEGREES_OF_FREEDOM = dof(true, true, true, true, true, true);
const PASSIVE_CHARACTER_FRICTION = 0.55;

export class PassiveCharacter {
  readonly body: RigidBody;
  readonly object = new THREE.Group();

  private readonly animator: PlayerAnimator;

  constructor(
    world: World,
    layers: PhysicsLayers,
    scene: THREE.Scene,
    position: Vec3,
    color: MannequinBodyColor,
    facingYaw = 0,
  ) {
    const quaternion = yawQuaternion(facingYaw);
    this.animator = new PlayerAnimator(color);
    this.body = rigidBody.create(world, {
      shape: offsetCenterOfMass.create({
        shape: capsule.create({
          halfHeightOfCylinder: CAPSULE_HALF_HEIGHT,
          radius: CAPSULE_RADIUS,
        }),
        offset: PASSIVE_CHARACTER_CENTER_OF_MASS_OFFSET,
      }),
      motionType: MotionType.DYNAMIC,
      position,
      quaternion,
      objectLayer: layers.props,
      friction: PASSIVE_CHARACTER_FRICTION,
      frictionCombineMode: MaterialCombineMode.MIN,
      restitution: 0.05,
      linearDamping: 0,
      angularDamping: 0,
      mass: 1,
      motionQuality: MotionQuality.LINEAR_CAST,
      allowedDegreesOfFreedom: PASSIVE_CHARACTER_ALLOWED_DEGREES_OF_FREEDOM,
    });

    this.object.position.set(position[0], position[1], position[2]);
    this.object.quaternion.fromArray(quaternion);
    this.animator.loadVisualModel(this.object).catch((error: unknown) => {
      console.error("Failed to load passive character mannequin.", error);
    });
    scene.add(this.object);
  }

  update(dt: number) {
    this.animator.update(dt, {
      hadGroundContact: true,
      hasGroundContact: true,
      wantsRunAnimation: false,
      horizontalSpeed: 0,
    });
  }

  syncVisual() {
    const position = this.body.position;
    const quaternion = this.body.quaternion;
    this.object.position.set(position[0], position[1], position[2]);
    this.object.quaternion.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
  }
}

function yawQuaternion(yaw: number): [number, number, number, number] {
  const halfYaw = yaw * 0.5;
  return [0, Math.sin(halfYaw), 0, Math.cos(halfYaw)];
}
