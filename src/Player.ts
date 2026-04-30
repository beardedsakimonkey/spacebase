import {
  CastRayStatus,
  capsule,
  castRay,
  createClosestCastRayCollector,
  createDefaultCastRaySettings,
  dof,
  filter,
  type Filter,
  MaterialCombineMode,
  MotionQuality,
  MotionType,
  rigidBody,
  type RigidBody,
  type Shape,
  type World,
} from "crashcat";
import type { Vec3 } from "mathcat";
import { vec3 } from "mathcat";
import * as THREE from "three";
import type { MovementInput } from "./input";
import { characterAnimationAsset, characterMannequinAsset } from "./assets";
import { getConveyorVelocity } from "./Conveyor";
import { remapMannequinBodyColor, type MannequinBodyColor } from "./util/mannequin";
import { PlayerAnimator } from "./PlayerAnimator";
import { loadGltf } from "./util/kaykit";
import type { PhysicsLayers } from "./physics";

export type PlayerTelemetry = {
  speed: number;
};

type PlayerInputState = {
  moveDirection: Vec3;
  wantToJump: boolean;
};

const rayCollector = createClosestCastRayCollector();
const raySettings = createDefaultCastRaySettings();

const rayOrigin: Vec3 = vec3.create();
const desiredHorizontal: Vec3 = vec3.create();
const deltaVelocity: Vec3 = vec3.create();
const horizontalImpulse: Vec3 = vec3.create();
const impulsePoint: Vec3 = vec3.create();
const groundHitPosition: Vec3 = vec3.create();
const groundSlopeNormal: Vec3 = vec3.fromValues(0, 1, 0);
const dashVelocity: Vec3 = vec3.create();
const worldUp: Vec3 = vec3.fromValues(0, 1, 0);
const visualPosition = new THREE.Vector3();
const visualForward = new THREE.Vector3();

function normalizeAngle(angle: number) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

const PLAYER_MODEL_SCALE = 1.0;
const PLAYER_MODEL_OFFSET_Y = -1.1;
const PLAYER_BODY_COLOR: MannequinBodyColor = "yellow";
const MOVE_INPUT_EPSILON = 0.001;
const MIN_SAFE_DURATION = 0.001;
const MAX_GROUND_CORRECTION_SPEED = 2;
const RESPAWN_Y = -14;
const PLAYER_SPAWN_POSITION: Vec3 = [0, 3.5, 0];
const CAPSULE_RADIUS = 0.58;
const CAPSULE_HALF_HEIGHT = 0.51;
const PLAYER_ALLOWED_DEGREES_OF_FREEDOM = dof(true, true, true, false, true, false);
const MAX_RUN_SPEED = 7;
const ACCELERATION_TIME = 7.5;
const TURN_SPEED = 9;
const AIR_CONTROL_FACTOR = 0.22;
const DRAG_DAMPING_C = 0.18;
const MOVE_IMPULSE_POINT_Y = 0.51;
const PLAYER_FRICTION = 0.35;
const MAX_SLOPE_ANGLE = 0.95;
const JUMP_VELOCITY = 6.8;
const NORMAL_GRAVITY_SCALE = 0.85;
const FALLING_GRAVITY_SCALE = 2;
const MAX_FALL_SPEED = 22;
const JUMP_GROUND_IGNORE_TIME = 0.14;
const LANDING_DAMPING = 0.2;
const GROUNDED_SNAP_SPEED = 18;
const GROUND_CONTACT_TOLERANCE = 0.04;
const RAY_HIT_FORGIVENESS = 0.04;
const DASH_IMPULSE = 30;
const DASH_UPWARD_IMPULSE = 1.9;
const DASH_DURATION = 0.44;
const DASH_COOLDOWN = 0.7;

export class PlayerController {
  readonly body: RigidBody;
  readonly object: THREE.Group;

  private readonly queryFilter: Filter;
  private readonly animator = new PlayerAnimator();
  private readonly input: PlayerInputState = {
    moveDirection: vec3.create(),
    wantToJump: false,
  };

  // Stable authored facing, decoupled from the dynamic body's noisy collision rotation.
  private facingYaw = 0;
  private hasGroundContact = false;
  private canGroundJump = false;
  private hadGroundContact = false;
  private readonly groundSurfaceVelocity: Vec3 = vec3.create();
  private groundDistance = 0;
  private dashTimer = 0;
  private dashCooldownTimer = 0;
  private readonly dashDirection: Vec3 = vec3.fromValues(0, 0, 1);
  private jumpGroundIgnoreTimer = 0;
  private jumpWasHeld = false;
  private airJumpsRemaining = 0;
  private airDashUsed = false;

  constructor(world: World, layers: PhysicsLayers, scene: THREE.Scene) {
    const shape: Shape = capsule.create({
      halfHeightOfCylinder: CAPSULE_HALF_HEIGHT,
      radius: CAPSULE_RADIUS,
    });

    this.body = rigidBody.create(world, {
      shape,
      motionType: MotionType.DYNAMIC,
      position: PLAYER_SPAWN_POSITION,
      objectLayer: layers.player,
      // MIN lets player friction cap terrain contact grip instead of inheriting sticky surfaces.
      friction: PLAYER_FRICTION,
      frictionCombineMode: MaterialCombineMode.MIN,
      restitution: 0.05,
      linearDamping: 0,
      angularDamping: 0,
      mass: 1,
      // Dash speeds can cross thin walls in one tick; linear CCD sweeps the capsule along its motion.
      motionQuality: MotionQuality.LINEAR_CAST,
      // Lock roll/pitch at the solver level; no spring impulse is applied to rebalance the body.
      allowedDegreesOfFreedom: PLAYER_ALLOWED_DEGREES_OF_FREEDOM,
    });
    this.body.motionProperties.gravityFactor = NORMAL_GRAVITY_SCALE;
    this.queryFilter = filter.create(world.settings.layers);
    this.queryFilter.bodyFilter = (body) => body.id !== this.body.id;
    this.object = this.createVisual();
    scene.add(this.object);
  }

  update(
    world: World,
    input: MovementInput,
    cameraMoveDirection: THREE.Vector3,
    dt: number,
  ) {
    this.hadGroundContact = this.hasGroundContact;
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - dt);
    this.jumpGroundIgnoreTimer = Math.max(0, this.jumpGroundIgnoreTimer - dt);
    this.input.wantToJump = input.jump;
    vec3.set(this.input.moveDirection, cameraMoveDirection.x, 0, cameraMoveDirection.z);
    this.body.friction = PLAYER_FRICTION;

    this.updateFacingYaw(dt);
    this.updateGround(world);
    this.applyLandingDamping(world);

    // Dash is an explicit velocity override; otherwise use the softer horizontal motor.
    if (this.dashTimer > 0) {
      this.applyDashVelocity(world);
    } else {
      this.applyHorizontalControl(world);
    }

    this.applyGroundContactCorrection(world);
    this.handleJump(world);
    this.updateGravityScale();
    this.updateAnimation(dt);

    if (this.body.position[1] < RESPAWN_Y) {
      this.reset(world);
    }
  }

  reset(world: World) {
    rigidBody.setPosition(world, this.body, PLAYER_SPAWN_POSITION, false);
    rigidBody.setLinearVelocity(world, this.body, [0, 0, 0]);
    rigidBody.setAngularVelocity(world, this.body, [0, 0, 0]);
    this.body.quaternion = [0, 0, 0, 1];
    this.facingYaw = 0;
    this.dashTimer = 0;
    this.dashCooldownTimer = 0;
    this.jumpGroundIgnoreTimer = 0;
    this.jumpWasHeld = false;
    this.airJumpsRemaining = 0;
    this.airDashUsed = false;
    this.hasGroundContact = false;
    this.canGroundJump = false;
    this.hadGroundContact = false;
    vec3.set(this.groundSurfaceVelocity, 0, 0, 0);
    this.groundDistance = 0;
    this.animator.reset();
  }

  dash(world: World) {
    if (this.dashCooldownTimer > 0) {
      return false;
    }
    if (!this.hasGroundContact && this.airDashUsed) {
      return false;
    }

    if (this.hasMoveInput()) {
      vec3.normalize(this.dashDirection, this.input.moveDirection);
    } else {
      const forward = this.getForward();
      this.dashDirection[0] = forward.x;
      this.dashDirection[1] = 0;
      this.dashDirection[2] = forward.z;
    }
    this.dashTimer = DASH_DURATION;
    this.dashCooldownTimer = DASH_COOLDOWN;
    if (!this.hasGroundContact) {
      this.airDashUsed = true;
    }
    this.animator.startDash();
    this.applyDashVelocity(world, true);
    return true;
  }

  getPosition(out = visualPosition) {
    const position = this.body.position;
    return out.set(position[0], position[1], position[2]);
  }

  getForward(out = visualForward) {
    return out.set(Math.sin(this.facingYaw), 0, Math.cos(this.facingYaw)).normalize();
  }

  private hasMoveInput() {
    return vec3.length(this.input.moveDirection) > MOVE_INPUT_EPSILON;
  }

  private canUseJump() {
    return this.canGroundJump || (!this.hasGroundContact && this.airJumpsRemaining > 0);
  }

  getTelemetry(): PlayerTelemetry {
    const velocity = this.body.motionProperties.linearVelocity;
    const horizontalSpeed = Math.hypot(velocity[0], velocity[2]);
    return {
      speed: horizontalSpeed,
    };
  }

  private createVisual() {
    const group = new THREE.Group();

    this.loadVisualModel(group).catch((error: unknown) => {
      console.error("Failed to load player mannequin.", error);
    });

    return group;
  }

  private async loadVisualModel(group: THREE.Group) {
    const [modelGltf, generalGltf, movementGltf, movementAdvancedGltf] = await Promise.all([
      loadGltf(characterMannequinAsset("medium")),
      loadGltf(characterAnimationAsset("medium", "general")),
      loadGltf(characterAnimationAsset("medium", "movement_basic")),
      loadGltf(characterAnimationAsset("medium", "movement_advanced")),
    ]);

    const model = modelGltf.scene;
    model.scale.setScalar(PLAYER_MODEL_SCALE);
    model.position.y = PLAYER_MODEL_OFFSET_Y;
    remapMannequinBodyColor(model, PLAYER_BODY_COLOR);
    model.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.castShadow = true;
        // Self-shadowing on the animated mannequin creates visible flicker.
        node.receiveShadow = false;
      }
    });
    group.add(model);

    this.animator.attach(model, generalGltf.animations, movementGltf.animations, movementAdvancedGltf.animations);
  }

  private updateAnimation(dt: number) {
    const velocity = this.body.motionProperties.linearVelocity;
    this.animator.update(dt, {
      hadGroundContact: this.hadGroundContact,
      hasGroundContact: this.hasGroundContact,
      wantsRunAnimation: this.hasMoveInput() || this.dashTimer > 0,
      horizontalSpeed: Math.hypot(velocity[0], velocity[2]),
    });
  }

  private updateFacingYaw(dt: number) {
    if (this.hasMoveInput()) {
      const targetYaw = Math.atan2(this.input.moveDirection[0], this.input.moveDirection[2]);
      const deltaYaw = normalizeAngle(targetYaw - this.facingYaw);
      const step = Math.max(-TURN_SPEED * dt, Math.min(TURN_SPEED * dt, deltaYaw));
      this.facingYaw += step;
    }
  }

  private updateGround(world: World) {
    vec3.set(groundSlopeNormal, 0, 1, 0);
    this.canGroundJump = false;
    vec3.set(this.groundSurfaceVelocity, 0, 0, 0);

    if (this.jumpGroundIgnoreTimer > 0) {
      // Fresh jumps ignore nearby ground so grounded snap cannot pull the player back down.
      this.hasGroundContact = false;
      this.groundDistance = 0;
      return;
    }

    const position = this.body.position;
    rayOrigin[0] = position[0];
    rayOrigin[1] = position[1] - CAPSULE_HALF_HEIGHT;
    rayOrigin[2] = position[2];

    const rayLength = CAPSULE_RADIUS + 2;

    rayCollector.reset();
    castRay(world, rayCollector, raySettings, rayOrigin, [0, -1, 0], rayLength, this.queryFilter);

    const hitDistance = rayCollector.hit.status === CastRayStatus.COLLIDING
      ? rayCollector.hit.fraction * rayLength
      : Infinity;

    if (hitDistance >= CAPSULE_RADIUS + RAY_HIT_FORGIVENESS) {
      this.hasGroundContact = false;
      this.groundDistance = 0;
      return;
    }

    this.hasGroundContact = true;
    this.groundDistance = hitDistance;
    vec3.set(groundHitPosition, rayOrigin[0], rayOrigin[1] - hitDistance, rayOrigin[2]);
    const groundBodyId = rayCollector.hit.bodyIdB;
    const groundSubShapeId = rayCollector.hit.subShapeId;

    // Ground state comes only from center contact; forward probes made ledges feel sticky.
    const groundBody = rigidBody.get(world, groundBodyId);
    if (groundBody) {
      const conveyorVelocity = getConveyorVelocity(groundBody);
      if (conveyorVelocity) {
        vec3.set(this.groundSurfaceVelocity, conveyorVelocity[0], conveyorVelocity[1], conveyorVelocity[2]);
      }
      rigidBody.getSurfaceNormal(groundSlopeNormal, groundBody, groundHitPosition, groundSubShapeId);
      const slopeAngle = Math.acos(
        THREE.MathUtils.clamp(vec3.dot(groundSlopeNormal, worldUp), -1, 1),
      );
      this.canGroundJump = slopeAngle < MAX_SLOPE_ANGLE;
      if (this.canGroundJump) {
        this.airJumpsRemaining = 1;
        this.airDashUsed = false;
      }
    }
  }

  private applyHorizontalControl(world: World) {
    const hasMoveInput = this.hasMoveInput();
    if (!hasMoveInput && !this.canGroundJump) {
      // Preserve airborne momentum when the player releases movement input.
      return;
    }

    const currentVelocity = this.body.motionProperties.linearVelocity;
    const targetSpeed = hasMoveInput ? MAX_RUN_SPEED : 0;

    // Horizontal velocity is controlled relative to the surface so conveyors add to,
    // rather than cancel, player motion.
    desiredHorizontal[0] = this.input.moveDirection[0] * targetSpeed;
    desiredHorizontal[1] = 0;
    desiredHorizontal[2] = this.input.moveDirection[2] * targetSpeed;
    desiredHorizontal[0] += this.groundSurfaceVelocity[0];
    desiredHorizontal[2] += this.groundSurfaceVelocity[2];

    deltaVelocity[0] = desiredHorizontal[0] - currentVelocity[0];
    deltaVelocity[1] = 0;
    deltaVelocity[2] = desiredHorizontal[2] - currentVelocity[2];

    const acceleration = 1 / Math.max(MIN_SAFE_DURATION, ACCELERATION_TIME);
    const controlStrength = hasMoveInput
      ? acceleration * (this.canGroundJump ? 1 : AIR_CONTROL_FACTOR)
      : DRAG_DAMPING_C;

    horizontalImpulse[0] = deltaVelocity[0] * controlStrength;
    horizontalImpulse[1] = 0;
    horizontalImpulse[2] = deltaVelocity[2] * controlStrength;

    if (!hasMoveInput) {
      // Idle braking is a center impulse so it slows drift without adding rotation.
      rigidBody.addImpulse(world, this.body, horizontalImpulse);
      return;
    }

    const position = this.body.position;
    impulsePoint[0] = position[0];
    impulsePoint[1] = position[1] + MOVE_IMPULSE_POINT_Y;
    impulsePoint[2] = position[2];
    // Movement pushes above center so the dynamic body still reacts physically to locomotion.
    rigidBody.addImpulseAtPosition(world, this.body, horizontalImpulse, impulsePoint);
  }

  private applyDashVelocity(world: World, includeUpwardImpulse = false) {
    const velocity = this.body.motionProperties.linearVelocity;
    const dashDuration = Math.max(MIN_SAFE_DURATION, DASH_DURATION);
    const dashSpeed = DASH_IMPULSE * Math.max(0, Math.min(1, this.dashTimer / dashDuration));

    // Dash input is locked, so speed decays across the committed dash instead of being re-applied flat.
    dashVelocity[0] = this.dashDirection[0] * dashSpeed;
    dashVelocity[1] = includeUpwardImpulse ? velocity[1] + DASH_UPWARD_IMPULSE : velocity[1];
    dashVelocity[2] = this.dashDirection[2] * dashSpeed;
    rigidBody.setLinearVelocity(world, this.body, dashVelocity);
  }

  private applyLandingDamping(world: World) {
    const velocity = this.body.motionProperties.linearVelocity;
    if (!this.hadGroundContact && this.hasGroundContact && velocity[1] < 0) {
      // Landing should settle into contact instead of rebounding from downward velocity.
      rigidBody.setLinearVelocity(world, this.body, [
        velocity[0],
        velocity[1] * LANDING_DAMPING,
        velocity[2],
      ]);
    }
  }

  private applyGroundContactCorrection(world: World) {
    if (!this.hasGroundContact) {
      return;
    }

    // Ground snap is vertical-only; horizontal control is handled by applyHorizontalControl().
    const velocity = this.body.motionProperties.linearVelocity;
    const contactError = CAPSULE_RADIUS - this.groundDistance;
    if (contactError <= GROUND_CONTACT_TOLERANCE) {
      return;
    }

    const correctionVelocity = Math.min(contactError * GROUNDED_SNAP_SPEED, MAX_GROUND_CORRECTION_SPEED);
    if (velocity[1] >= correctionVelocity) {
      return;
    }

    // Only resolve upward from contact; gravity handles downward motion so edges do not gain extra grip.
    rigidBody.setLinearVelocity(world, this.body, [
      velocity[0],
      correctionVelocity,
      velocity[2],
    ]);
  }

  private handleJump(world: World) {
    const jumpPressed = this.input.wantToJump && !this.jumpWasHeld;
    this.jumpWasHeld = this.input.wantToJump;

    if (!jumpPressed || !this.canUseJump() || this.dashTimer > 0) {
      return;
    }

    if (!this.canGroundJump) {
      // Ground contact refills this budget; airborne jumps spend it until the next valid landing.
      this.airJumpsRemaining = Math.max(0, this.airJumpsRemaining - 1);
    }

    const velocity = this.body.motionProperties.linearVelocity;
    rigidBody.setLinearVelocity(world, this.body, [velocity[0], JUMP_VELOCITY, velocity[2]]);
    this.jumpGroundIgnoreTimer = JUMP_GROUND_IGNORE_TIME;
    this.canGroundJump = false;
    this.animator.startJump();
  }

  private updateGravityScale() {
    const verticalVelocity = this.body.motionProperties.linearVelocity[1];
    if (verticalVelocity < -MAX_FALL_SPEED) {
      this.body.motionProperties.gravityFactor = 0;
    } else if (verticalVelocity < 0 && !this.canGroundJump) {
      this.body.motionProperties.gravityFactor = FALLING_GRAVITY_SCALE;
    } else {
      this.body.motionProperties.gravityFactor = NORMAL_GRAVITY_SCALE;
    }
  }

  syncVisual() {
    const position = this.body.position;
    this.object.position.set(position[0], position[1], position[2]);
    // Render with stable gameplay yaw instead of collision-driven capsule rotation.
    this.object.rotation.set(0, this.facingYaw, 0);
  }
}
