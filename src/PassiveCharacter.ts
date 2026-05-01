import {
  capsule,
  dof,
  MaterialCombineMode,
  MotionQuality,
  MotionType,
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
const PASSIVE_CHARACTER_ALLOWED_DEGREES_OF_FREEDOM = dof(true, true, true, false, false, false);
const PASSIVE_CHARACTER_FRICTION = 0.15;

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
    private readonly facingYaw = 0,
  ) {
    this.animator = new PlayerAnimator(color);
    this.body = rigidBody.create(world, {
      shape: capsule.create({
        halfHeightOfCylinder: CAPSULE_HALF_HEIGHT,
        radius: CAPSULE_RADIUS,
      }),
      motionType: MotionType.DYNAMIC,
      position,
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
    this.object.rotation.set(0, this.facingYaw, 0);
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
    this.object.position.set(position[0], position[1], position[2]);
    this.object.rotation.set(0, this.facingYaw, 0);
  }
}
