import {
  CastRayStatus,
  capsule,
  castRay,
  createClosestCastRayCollector,
  createDefaultCastRaySettings,
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
  grounded: boolean;
  canJump: boolean;
};

type PlayerInputState = {
  moveDirection: Vec3;
  wantToJump: boolean;
};

const PLAYER_MODEL_SCALE = 0.82;
const PLAYER_MODEL_OFFSET_Y = -0.9;
const PLAYER_BODY_COLOR: MannequinBodyColor = "yellow";
const MOVE_INPUT_EPSILON = 0.001;
const TURN_TARGET_EPSILON = 0.08;
const REVERSAL_TURN_THRESHOLD = Math.PI * 0.82;
const MIN_SAFE_DURATION = 0.001;
const MAX_GROUND_CORRECTION_SPEED = 2;
const RESPAWN_Y = -14;
const PLAYER_SPAWN_POSITION: Vec3 = [0, 3.5, 0];

const rayCollector = createClosestCastRayCollector();
const raySettings = createDefaultCastRaySettings();

const rayOrigin: Vec3 = vec3.create();
const currentHorizontal: Vec3 = vec3.create();
const desiredHorizontal: Vec3 = vec3.create();
const deltaVelocity: Vec3 = vec3.create();
const moveImpulse: Vec3 = vec3.create();
const impulsePoint: Vec3 = vec3.create();
const dragImpulse: Vec3 = vec3.create();
const bodyUp: Vec3 = vec3.create();
const bodyForward: Vec3 = vec3.create();
const desiredForward: Vec3 = vec3.create();
const upCorrection: Vec3 = vec3.create();
const yawCorrection: Vec3 = vec3.create();
const balanceTorque: Vec3 = vec3.create();
const dashVelocity: Vec3 = vec3.create();
const worldUp: Vec3 = vec3.fromValues(0, 1, 0);
const visualPosition = new THREE.Vector3();
const visualForward = new THREE.Vector3();

function normalizeAngle(angle: number) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

const TUNING = {
  capsuleRadius: 0.48,
  capsuleHalfHeight: 0.42,
  maxRunSpeed: 7,
  accelerationTime: 7.5,
  turnSpeed: 9,
  airControlFactor: 0.22,
  dragDampingC: 0.18,
  moveImpulsePointY: 0.42,
  playerFriction: 0.35,
  maxSlopeAngle: 0.95,
  balanceSpringK: 0.42,
  balanceDampingC: 0.16,
  balanceYawSpringK: 0.38,
  balanceYawDampingC: 0.08,
  jumpVelocity: 6.8,
  normalGravityScale: 0.85,
  fallingGravityScale: 2,
  maxFallSpeed: 22,
  jumpGroundIgnoreTime: 0.14,
  landingDamping: 0.2,
  groundedSnapSpeed: 18,
  groundContactTolerance: 0.04,
  rayHitForgiveness: 0.04,
  dashImpulse: 30,
  dashUpwardImpulse: 1.9,
  dashDuration: 0.44,
  dashCooldown: 0.7,
} as const;

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
  private reversalTurnTargetYaw: number | null = null;
  private reversalTurnSign = 0;
  private lastTurnSign = 1;
  private isOnGround = false;
  private canJump = false;
  private wasOnGround = false;
  private actualSlopeNormal: Vec3 = vec3.fromValues(0, 1, 0);
  private actualSlopeAngle = 0;
  private groundBodyId: number | null = null;
  private groundSubShapeId = 0;
  private groundPosition: Vec3 = vec3.create();
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
      halfHeightOfCylinder: TUNING.capsuleHalfHeight,
      radius: TUNING.capsuleRadius,
    });

    this.body = rigidBody.create(world, {
      shape,
      motionType: MotionType.DYNAMIC,
      position: PLAYER_SPAWN_POSITION,
      objectLayer: layers.player,
      // MIN lets player friction cap terrain contact grip instead of inheriting sticky surfaces.
      friction: TUNING.playerFriction,
      frictionCombineMode: MaterialCombineMode.MIN,
      restitution: 0.05,
      linearDamping: 0,
      angularDamping: 0,
      mass: 1,
      // Dash speeds can cross thin walls in one tick; linear CCD sweeps the capsule along its motion.
      motionQuality: MotionQuality.LINEAR_CAST,
      allowedDegreesOfFreedom: 0b111111,
    });
    this.body.motionProperties.gravityFactor = TUNING.normalGravityScale;
    this.queryFilter = filter.create(world.settings.layers);
    this.queryFilter.bodyFilter = (body) => body.id !== this.body.id;
    this.object = this.createVisual();
    scene.add(this.object);
  }

  update(
    world: World,
    input: MovementInput,
    cameraMoveDirection: THREE.Vector3,
    cameraPosition: THREE.Vector3,
    dt: number,
  ) {
    this.wasOnGround = this.isOnGround;
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - dt);
    this.jumpGroundIgnoreTimer = Math.max(0, this.jumpGroundIgnoreTimer - dt);
    this.input.wantToJump = input.jump;
    vec3.set(this.input.moveDirection, cameraMoveDirection.x, 0, cameraMoveDirection.z);
    this.body.friction = TUNING.playerFriction;

    this.updateFacingYaw(dt, cameraPosition);
    this.updateGround(world);
    this.applyLandingDamping(world);

    if (this.dashTimer > 0) {
      this.applyDashVelocity(world);
    } else if (this.hasMoveInput()) {
      this.applyMovementImpulse(world);
    } else {
      this.applyDragImpulse(world);
    }

    this.applyGroundContactCorrection(world);
    this.applyAutoBalanceImpulse(world);
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
    this.reversalTurnTargetYaw = null;
    this.reversalTurnSign = 0;
    this.lastTurnSign = 1;
    this.dashTimer = 0;
    this.dashCooldownTimer = 0;
    this.jumpGroundIgnoreTimer = 0;
    this.jumpWasHeld = false;
    this.airJumpsRemaining = 0;
    this.airDashUsed = false;
    this.isOnGround = false;
    this.canJump = false;
    this.wasOnGround = false;
    vec3.set(this.actualSlopeNormal, 0, 1, 0);
    this.actualSlopeAngle = 0;
    this.groundBodyId = null;
    this.groundSubShapeId = 0;
    vec3.set(this.groundPosition, 0, 0, 0);
    vec3.set(this.groundSurfaceVelocity, 0, 0, 0);
    this.groundDistance = 0;
    this.animator.reset();
  }

  startThrowAnimation(direction: THREE.Vector3) {
    const hx = direction.x;
    const hz = direction.z;
    if (Math.hypot(hx, hz) > MOVE_INPUT_EPSILON) {
      this.facingYaw = Math.atan2(hx, hz);
    }
    this.animator.startThrow();
  }

  dash(world: World) {
    if (this.dashCooldownTimer > 0) {
      return false;
    }
    if (!this.isOnGround && this.airDashUsed) {
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
    this.dashTimer = TUNING.dashDuration;
    this.dashCooldownTimer = TUNING.dashCooldown;
    if (!this.isOnGround) {
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

  getVelocity(out = new THREE.Vector3()) {
    const velocity = this.body.motionProperties.linearVelocity;
    return out.set(velocity[0], velocity[1], velocity[2]);
  }

  private hasMoveInput() {
    return vec3.length(this.input.moveDirection) > MOVE_INPUT_EPSILON;
  }

  private canUseJump() {
    return this.canJump || (!this.isOnGround && this.airJumpsRemaining > 0);
  }

  getTelemetry(): PlayerTelemetry {
    const velocity = this.body.motionProperties.linearVelocity;
    const horizontalSpeed = Math.hypot(velocity[0], velocity[2]);
    return {
      speed: horizontalSpeed,
      grounded: this.isOnGround,
      canJump: this.canUseJump(),
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
      wasOnGround: this.wasOnGround,
      isOnGround: this.isOnGround,
      wantsRunAnimation: this.hasMoveInput() || this.dashTimer > 0,
      horizontalSpeed: Math.hypot(velocity[0], velocity[2]),
    });
  }

  private updateFacingYaw(dt: number, cameraPosition: THREE.Vector3) {
    if (this.animator.isThrowing()) {
      return;
    }
    if (this.hasMoveInput()) {
      const targetYaw = Math.atan2(this.input.moveDirection[0], this.input.moveDirection[2]);
      let deltaYaw = normalizeAngle(targetYaw - this.facingYaw);
      const targetChanged =
        this.reversalTurnTargetYaw !== null &&
        Math.abs(normalizeAngle(targetYaw - this.reversalTurnTargetYaw)) > TURN_TARGET_EPSILON;

      if (targetChanged) {
        this.reversalTurnTargetYaw = null;
        this.reversalTurnSign = 0;
      }

      if (Math.abs(deltaYaw) > REVERSAL_TURN_THRESHOLD) {
        if (this.reversalTurnSign === 0) {
          // Lock reversal direction once; recalculating this every frame can flip signs and jitter.
          const position = this.body.position;
          const cameraSideX = cameraPosition.x - position[0];
          const cameraSideZ = cameraPosition.z - position[2];
          const positiveTurnMidYaw = this.facingYaw + Math.PI / 2;
          const positiveTurnMidX = Math.sin(positiveTurnMidYaw);
          const positiveTurnMidZ = Math.cos(positiveTurnMidYaw);
          const cameraDot = positiveTurnMidX * cameraSideX + positiveTurnMidZ * cameraSideZ;
          this.reversalTurnTargetYaw = targetYaw;
          this.reversalTurnSign = Math.abs(cameraDot) > MOVE_INPUT_EPSILON ? Math.sign(cameraDot) : this.lastTurnSign;
        }

        deltaYaw = Math.abs(deltaYaw) * this.reversalTurnSign;
      } else if (Math.abs(deltaYaw) < TURN_TARGET_EPSILON) {
        this.reversalTurnTargetYaw = null;
        this.reversalTurnSign = 0;
      }

      const step = Math.max(-TUNING.turnSpeed * dt, Math.min(TUNING.turnSpeed * dt, deltaYaw));
      this.facingYaw += step;
      if (Math.abs(step) > 0.0001) {
        this.lastTurnSign = Math.sign(step);
      }
    } else {
      this.reversalTurnTargetYaw = null;
      this.reversalTurnSign = 0;
    }
  }

  private updateGround(world: World) {
    vec3.set(this.actualSlopeNormal, 0, 1, 0);
    this.actualSlopeAngle = 0;
    this.canJump = false;
    vec3.set(this.groundSurfaceVelocity, 0, 0, 0);

    if (this.jumpGroundIgnoreTimer > 0) {
      // Fresh jumps ignore nearby ground so grounded snap cannot pull the player back down.
      this.isOnGround = false;
      this.groundBodyId = null;
      this.groundDistance = 0;
      return;
    }

    const position = this.body.position;
    rayOrigin[0] = position[0];
    rayOrigin[1] = position[1] - TUNING.capsuleHalfHeight;
    rayOrigin[2] = position[2];

    const rayLength = TUNING.capsuleRadius + 2;

    rayCollector.reset();
    castRay(world, rayCollector, raySettings, rayOrigin, [0, -1, 0], rayLength, this.queryFilter);

    const hitDistance = rayCollector.hit.status === CastRayStatus.COLLIDING
      ? rayCollector.hit.fraction * rayLength
      : Infinity;

    if (hitDistance >= TUNING.capsuleRadius + TUNING.rayHitForgiveness) {
      this.isOnGround = false;
      this.groundBodyId = null;
      this.groundDistance = 0;
      return;
    }

    this.isOnGround = true;
    this.groundDistance = hitDistance;
    vec3.set(this.groundPosition, rayOrigin[0], rayOrigin[1] - hitDistance, rayOrigin[2]);
    this.groundBodyId = rayCollector.hit.bodyIdB;
    this.groundSubShapeId = rayCollector.hit.subShapeId;

    // Ground state comes only from center contact; forward probes made ledges feel sticky.
    const groundBody = rigidBody.get(world, this.groundBodyId);
    if (groundBody) {
      const conveyorVelocity = getConveyorVelocity(groundBody);
      if (conveyorVelocity) {
        vec3.set(this.groundSurfaceVelocity, conveyorVelocity[0], conveyorVelocity[1], conveyorVelocity[2]);
      }
      rigidBody.getSurfaceNormal(this.actualSlopeNormal, groundBody, this.groundPosition, this.groundSubShapeId);
      this.actualSlopeAngle = Math.acos(
        THREE.MathUtils.clamp(vec3.dot(this.actualSlopeNormal, worldUp), -1, 1),
      );
      this.canJump = this.actualSlopeAngle < TUNING.maxSlopeAngle;
      if (this.canJump) {
        this.airJumpsRemaining = 1;
        this.airDashUsed = false;
      }
    }
  }

  private applyMovementImpulse(world: World) {
    const targetSpeed = TUNING.maxRunSpeed;
    const currentVelocity = this.body.motionProperties.linearVelocity;

    currentHorizontal[0] = currentVelocity[0];
    currentHorizontal[1] = 0;
    currentHorizontal[2] = currentVelocity[2];

    desiredHorizontal[0] = this.input.moveDirection[0] * targetSpeed;
    desiredHorizontal[1] = 0;
    desiredHorizontal[2] = this.input.moveDirection[2] * targetSpeed;
    // Run speed is measured relative to the surface so conveyors add to, rather than cancel, player motion.
    desiredHorizontal[0] += this.groundSurfaceVelocity[0];
    desiredHorizontal[1] += this.groundSurfaceVelocity[1];
    desiredHorizontal[2] += this.groundSurfaceVelocity[2];

    deltaVelocity[0] = desiredHorizontal[0] - currentHorizontal[0];
    deltaVelocity[1] = 0;
    deltaVelocity[2] = desiredHorizontal[2] - currentHorizontal[2];

    const air = this.canJump ? 1 : TUNING.airControlFactor;
    const acceleration = 1 / Math.max(MIN_SAFE_DURATION, TUNING.accelerationTime);

    moveImpulse[0] = deltaVelocity[0] * acceleration * air;
    moveImpulse[1] = 0;
    moveImpulse[2] = deltaVelocity[2] * acceleration * air;

    const position = this.body.position;
    impulsePoint[0] = position[0];
    impulsePoint[1] = position[1] + TUNING.moveImpulsePointY;
    impulsePoint[2] = position[2];
    rigidBody.addImpulseAtPosition(world, this.body, moveImpulse, impulsePoint);
  }

  private applyDashVelocity(world: World, includeUpwardImpulse = false) {
    const velocity = this.body.motionProperties.linearVelocity;
    const dashDuration = Math.max(MIN_SAFE_DURATION, TUNING.dashDuration);
    const dashSpeed = TUNING.dashImpulse * Math.max(0, Math.min(1, this.dashTimer / dashDuration));

    // Dash input is locked, so speed decays across the committed dash instead of being re-applied flat.
    dashVelocity[0] = this.dashDirection[0] * dashSpeed;
    dashVelocity[1] = includeUpwardImpulse ? velocity[1] + TUNING.dashUpwardImpulse : velocity[1];
    dashVelocity[2] = this.dashDirection[2] * dashSpeed;
    rigidBody.setLinearVelocity(world, this.body, dashVelocity);
  }

  private applyLandingDamping(world: World) {
    const velocity = this.body.motionProperties.linearVelocity;
    if (!this.wasOnGround && this.isOnGround && velocity[1] < 0) {
      // Landing should settle into contact instead of rebounding from downward velocity.
      rigidBody.setLinearVelocity(world, this.body, [
        velocity[0],
        velocity[1] * TUNING.landingDamping,
        velocity[2],
      ]);
    }
  }

  private applyDragImpulse(world: World) {
    if (!this.canJump) {
      return;
    }
    const velocity = this.body.motionProperties.linearVelocity;
    dragImpulse[0] = -(velocity[0] - this.groundSurfaceVelocity[0]) * TUNING.dragDampingC;
    dragImpulse[1] = 0;
    dragImpulse[2] = -(velocity[2] - this.groundSurfaceVelocity[2]) * TUNING.dragDampingC;
    rigidBody.addImpulse(world, this.body, dragImpulse);
  }

  private applyGroundContactCorrection(world: World) {
    if (!this.isOnGround || this.groundBodyId === null) {
      return;
    }

    const velocity = this.body.motionProperties.linearVelocity;
    const contactError = TUNING.capsuleRadius - this.groundDistance;
    if (contactError <= TUNING.groundContactTolerance) {
      return;
    }

    const correctionVelocity = Math.min(contactError * TUNING.groundedSnapSpeed, MAX_GROUND_CORRECTION_SPEED);
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

  private applyAutoBalanceImpulse(world: World) {
    const bodyRotation = this.body.quaternion;
    vec3.set(bodyUp, 0, 1, 0);
    vec3.transformQuat(bodyUp, bodyUp, bodyRotation);
    vec3.set(bodyForward, 0, 0, 1);
    vec3.transformQuat(bodyForward, bodyForward, bodyRotation);

    vec3.cross(upCorrection, bodyUp, worldUp);

    desiredForward[0] = Math.sin(this.facingYaw);
    desiredForward[1] = 0;
    desiredForward[2] = Math.cos(this.facingYaw);
    bodyForward[1] = 0;
    if (vec3.length(bodyForward) > MOVE_INPUT_EPSILON) {
      vec3.normalize(bodyForward, bodyForward);
    }
    vec3.cross(yawCorrection, bodyForward, desiredForward);

    const angularVelocity = this.body.motionProperties.angularVelocity;
    balanceTorque[0] = upCorrection[0] * TUNING.balanceSpringK - angularVelocity[0] * TUNING.balanceDampingC;
    balanceTorque[1] = yawCorrection[1] * TUNING.balanceYawSpringK - angularVelocity[1] * TUNING.balanceYawDampingC;
    balanceTorque[2] = upCorrection[2] * TUNING.balanceSpringK - angularVelocity[2] * TUNING.balanceDampingC;

    rigidBody.addAngularImpulse(world, this.body, balanceTorque);
  }

  private handleJump(world: World) {
    const jumpPressed = this.input.wantToJump && !this.jumpWasHeld;
    this.jumpWasHeld = this.input.wantToJump;

    if (!jumpPressed || !this.canUseJump() || this.dashTimer > 0) {
      return;
    }

    if (!this.canJump) {
      // Ground contact refills this budget; airborne jumps spend it until the next valid landing.
      this.airJumpsRemaining = Math.max(0, this.airJumpsRemaining - 1);
    }

    const velocity = this.body.motionProperties.linearVelocity;
    rigidBody.setLinearVelocity(world, this.body, [velocity[0], TUNING.jumpVelocity, velocity[2]]);
    this.jumpGroundIgnoreTimer = TUNING.jumpGroundIgnoreTime;
    this.canJump = false;
    this.animator.startJump();
  }

  private updateGravityScale() {
    const verticalVelocity = this.body.motionProperties.linearVelocity[1];
    if (verticalVelocity < -TUNING.maxFallSpeed) {
      this.body.motionProperties.gravityFactor = 0;
    } else if (verticalVelocity < 0 && !this.canJump) {
      this.body.motionProperties.gravityFactor = TUNING.fallingGravityScale;
    } else {
      this.body.motionProperties.gravityFactor = TUNING.normalGravityScale;
    }
  }

  syncVisual() {
    const position = this.body.position;
    this.object.position.set(position[0], position[1], position[2]);
    // Render with stable gameplay yaw; physics auto-balance can jitter while correcting capsule rotation.
    this.object.rotation.set(0, this.facingYaw, 0);
  }
}
