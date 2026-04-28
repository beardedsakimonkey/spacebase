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
import { getConveyorVelocity } from "./conveyor";
import { loadGltf } from "./kaykit";
import type { PhysicsLayers } from "./physics";

type PlayerTuning = {
  capsuleRadius: number;
  capsuleHalfHeight: number;
  maxRunSpeed: number;
  accelerationTime: number;
  turnSpeed: number;
  airControlFactor: number;
  dragDampingC: number;
  moveImpulsePointY: number;
  playerFriction: number;
  maxSlopeAngle: number;
  balanceSpringK: number;
  balanceDampingC: number;
  balanceYawSpringK: number;
  balanceYawDampingC: number;
  jumpVelocity: number;
  normalGravityScale: number;
  fallingGravityScale: number;
  maxFallSpeed: number;
  jumpGroundIgnoreTime: number;
  landingDamping: number;
  groundedSnapSpeed: number;
  groundContactTolerance: number;
  rayHitForgiveness: number;
  dashImpulse: number;
  dashUpwardImpulse: number;
  dashDuration: number;
  dashCooldown: number;
};

export type PlayerTelemetry = {
  speed: number;
  grounded: boolean;
  canJump: boolean;
};

type PlayerInputState = {
  moveDirection: Vec3;
  wantToJump: boolean;
};

type PlayerAnimationName = "idle" | "run" | "jumpStart" | "jumpIdle" | "jumpLand";

const PLAYER_MODEL_SCALE = 0.82;
const PLAYER_MODEL_OFFSET_Y = -0.9;
const ANIMATION_FADE_SECONDS = 0.12;
const JUMP_START_ANIMATION_SECONDS = 0.28;
const LAND_ANIMATION_SECONDS = 0.24;

const rayCollector = createClosestCastRayCollector();
const raySettings = createDefaultCastRaySettings();
const ignoreSingleBodyFilterState = {
  bodyId: -1,
  innerBodyFilter: undefined as ((body: RigidBody) => boolean) | undefined,
};

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
const visualPosition = new THREE.Vector3();
const visualForward = new THREE.Vector3();

function normalizeAngle(angle: number) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

const PLAYER_TUNING: Readonly<PlayerTuning> = {
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
  normalGravityScale: 1,
  fallingGravityScale: 2.35,
  maxFallSpeed: 22,
  jumpGroundIgnoreTime: 0.14,
  landingDamping: 0.2,
  groundedSnapSpeed: 18,
  groundContactTolerance: 0.04,
  rayHitForgiveness: 0.04,
  dashImpulse: 30,
  dashUpwardImpulse: 1.9,
  dashDuration: 0.44,
  dashCooldown: 0.35,
};

function ignoreSingleBodyFilter(body: RigidBody): boolean {
  if (body.id === ignoreSingleBodyFilterState.bodyId) {
    return false;
  }
  return ignoreSingleBodyFilterState.innerBodyFilter?.(body) ?? true;
}

function setIgnoreSingleBodyFilter(queryFilter: Filter, ignoreBodyId: number) {
  ignoreSingleBodyFilterState.bodyId = ignoreBodyId;
  ignoreSingleBodyFilterState.innerBodyFilter = queryFilter.bodyFilter;
  queryFilter.bodyFilter = ignoreSingleBodyFilter;
}

function resetIgnoreSingleBodyFilter(queryFilter: Filter) {
  queryFilter.bodyFilter = ignoreSingleBodyFilterState.innerBodyFilter;
  ignoreSingleBodyFilterState.bodyId = -1;
  ignoreSingleBodyFilterState.innerBodyFilter = undefined;
}

export class PlayerController {
  readonly body: RigidBody;
  readonly object: THREE.Group;
  readonly tuning: Readonly<PlayerTuning>;

  private readonly queryFilter: Filter;
  private readonly debugGroup = new THREE.Group();
  private readonly animationActions = new Map<PlayerAnimationName, THREE.AnimationAction>();
  private readonly groundRayHelper = new THREE.ArrowHelper(
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(),
    1,
    0xff3b30,
  );
  private readonly groundNormalHelper = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(),
    1,
    0x46c7ff,
  );
  private readonly input: PlayerInputState = {
    moveDirection: vec3.create(),
    wantToJump: false,
  };

  private modelYaw = 0;
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
  private animationMixer: THREE.AnimationMixer | null = null;
  private activeAnimation: PlayerAnimationName | null = null;
  private jumpStartAnimationTimer = 0;
  private landAnimationTimer = 0;

  constructor(world: World, layers: PhysicsLayers, scene: THREE.Scene, tuning = PLAYER_TUNING) {
    this.tuning = tuning;
    const shape: Shape = capsule.create({
      halfHeightOfCylinder: tuning.capsuleHalfHeight,
      radius: tuning.capsuleRadius,
    });

    this.body = rigidBody.create(world, {
      shape,
      motionType: MotionType.DYNAMIC,
      position: [0, 3.5, 0],
      objectLayer: layers.player,
      // MIN lets player friction cap terrain contact grip instead of inheriting sticky surfaces.
      friction: tuning.playerFriction,
      frictionCombineMode: MaterialCombineMode.MIN,
      restitution: 0.05,
      linearDamping: 0,
      angularDamping: 0,
      mass: 1,
      // Dash speeds can cross thin walls in one tick; linear CCD sweeps the capsule along its motion.
      motionQuality: MotionQuality.LINEAR_CAST,
      allowedDegreesOfFreedom: 0b111111,
    });
    this.body.motionProperties.gravityFactor = tuning.normalGravityScale;
    this.queryFilter = filter.create(world.settings.layers);
    this.object = this.createVisual();

    this.debugGroup.add(this.groundRayHelper, this.groundNormalHelper);
    this.debugGroup.visible = false;
    scene.add(this.object, this.debugGroup);
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
    this.body.friction = this.tuning.playerFriction;

    this.updateModelYaw(dt, cameraPosition);
    this.updateGround(world);
    this.applyLandingDamping(world);

    if (this.dashTimer > 0) {
      this.applyDashVelocity(world);
    } else if (vec3.length(this.input.moveDirection) > 0.001) {
      this.applyMovementImpulse(world);
    } else {
      this.applyDragImpulse(world);
    }

    this.applyGroundContactCorrection(world);
    this.applyAutoBalanceImpulse(world);
    this.handleJump(world);
    this.updateGravityScale();
    this.updateAnimation(dt);
    this.syncVisual();
    this.updateDebugHelpers();

    if (this.body.position[1] < -14) {
      this.reset(world);
    }
  }

  setDebugVisible(visible: boolean) {
    this.debugGroup.visible = visible;
  }

  reset(world: World) {
    rigidBody.setPosition(world, this.body, [0, 3.5, 0], false);
    rigidBody.setLinearVelocity(world, this.body, [0, 0, 0]);
    rigidBody.setAngularVelocity(world, this.body, [0, 0, 0]);
    this.body.quaternion = [0, 0, 0, 1];
    this.modelYaw = 0;
    this.reversalTurnTargetYaw = null;
    this.reversalTurnSign = 0;
    this.lastTurnSign = 1;
    this.dashTimer = 0;
    this.dashCooldownTimer = 0;
    this.jumpGroundIgnoreTimer = 0;
    this.airJumpsRemaining = 0;
    this.airDashUsed = false;
    this.jumpStartAnimationTimer = 0;
    this.landAnimationTimer = 0;
    this.playAnimation("idle", 0.05);
  }

  dash(world: World) {
    if (this.dashCooldownTimer > 0) {
      return false;
    }
    if (!this.isOnGround && this.airDashUsed) {
      return false;
    }

    if (vec3.length(this.input.moveDirection) > 0.001) {
      vec3.normalize(this.dashDirection, this.input.moveDirection);
    } else {
      const forward = this.getForward();
      this.dashDirection[0] = forward.x;
      this.dashDirection[1] = 0;
      this.dashDirection[2] = forward.z;
    }
    this.dashTimer = this.tuning.dashDuration;
    this.dashCooldownTimer = this.tuning.dashCooldown;
    if (!this.isOnGround) {
      this.airDashUsed = true;
    }
    this.applyDashVelocity(world, true);
    return true;
  }

  getPosition(out = visualPosition) {
    const position = this.body.position;
    return out.set(position[0], position[1], position[2]);
  }

  getForward(out = visualForward) {
    return out.set(Math.sin(this.modelYaw), 0, Math.cos(this.modelYaw)).normalize();
  }

  getVelocity(out = new THREE.Vector3()) {
    const velocity = this.body.motionProperties.linearVelocity;
    return out.set(velocity[0], velocity[1], velocity[2]);
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
    const [modelGltf, generalGltf, movementGltf] = await Promise.all([
      loadGltf(characterMannequinAsset("medium")),
      loadGltf(characterAnimationAsset("medium", "general")),
      loadGltf(characterAnimationAsset("medium", "movement_basic")),
    ]);

    const model = modelGltf.scene;
    model.scale.setScalar(PLAYER_MODEL_SCALE);
    model.position.y = PLAYER_MODEL_OFFSET_Y;
    model.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    group.add(model);

    this.animationMixer = new THREE.AnimationMixer(model);
    this.bindAnimation("idle", model, generalGltf.animations, "Idle_A");
    this.bindAnimation("run", model, movementGltf.animations, "Running_B");
    this.bindAnimation("jumpStart", model, movementGltf.animations, "Jump_Start", true);
    this.bindAnimation("jumpIdle", model, movementGltf.animations, "Jump_Idle");
    this.bindAnimation("jumpLand", model, movementGltf.animations, "Jump_Land", true);
    this.playAnimation("idle", 0);
  }

  private bindAnimation(
    name: PlayerAnimationName,
    model: THREE.Group,
    clips: THREE.AnimationClip[],
    clipName: string,
    once = false,
  ) {
    if (!this.animationMixer) {
      return;
    }

    const sourceClip = THREE.AnimationClip.findByName(clips, clipName);
    if (!sourceClip) {
      console.warn(`Missing player animation clip: ${clipName}`);
      return;
    }

    const clip = this.filterClipForModel(sourceClip, model);
    const action = this.animationMixer.clipAction(clip);
    if (once) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
    }
    this.animationActions.set(name, action);
  }

  private filterClipForModel(clip: THREE.AnimationClip, model: THREE.Group) {
    const tracks = clip.tracks.filter((track) => {
      const { nodeName } = THREE.PropertyBinding.parseTrackName(track.name);
      return model.getObjectByName(nodeName) !== undefined;
    });

    if (tracks.length === clip.tracks.length) {
      return clip;
    }

    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  }

  private updateAnimation(dt: number) {
    if (!this.animationMixer) {
      return;
    }

    if (!this.wasOnGround && this.isOnGround) {
      this.landAnimationTimer = LAND_ANIMATION_SECONDS;
    }

    const velocity = this.body.motionProperties.linearVelocity;
    const horizontalSpeed = Math.hypot(velocity[0], velocity[2]);
    const wantsRunAnimation = vec3.length(this.input.moveDirection) > 0.001 || this.dashTimer > 0;
    const desired = this.getDesiredAnimation(wantsRunAnimation, dt);
    const action = this.animationActions.get(desired);
    if (action && desired === "run") {
      action.timeScale = THREE.MathUtils.clamp(horizontalSpeed / 8.2, 0.8, 1.65);
    } else if (action) {
      action.timeScale = 1;
    }

    this.playAnimation(desired);
    this.animationMixer.update(dt);
  }

  private getDesiredAnimation(wantsRunAnimation: boolean, dt: number): PlayerAnimationName {
    if (this.jumpStartAnimationTimer > 0) {
      this.jumpStartAnimationTimer = Math.max(0, this.jumpStartAnimationTimer - dt);
      return "jumpStart";
    }

    if (this.landAnimationTimer > 0) {
      this.landAnimationTimer = Math.max(0, this.landAnimationTimer - dt);
      return "jumpLand";
    }

    if (!this.isOnGround) {
      return "jumpIdle";
    }

    if (wantsRunAnimation) {
      return "run";
    }

    return "idle";
  }

  private playAnimation(name: PlayerAnimationName, fadeSeconds = ANIMATION_FADE_SECONDS) {
    const next = this.animationActions.get(name);
    if (!next || this.activeAnimation === name) {
      return;
    }

    const previous = this.activeAnimation ? this.animationActions.get(this.activeAnimation) : undefined;
    next.enabled = true;
    next.reset();
    next.setEffectiveWeight(1);
    next.fadeIn(fadeSeconds).play();
    previous?.fadeOut(fadeSeconds);
    this.activeAnimation = name;
  }

  private updateModelYaw(dt: number, cameraPosition: THREE.Vector3) {
    if (vec3.length(this.input.moveDirection) > 0.001) {
      const targetYaw = Math.atan2(this.input.moveDirection[0], this.input.moveDirection[2]);
      let deltaYaw = normalizeAngle(targetYaw - this.modelYaw);
      const targetChanged =
        this.reversalTurnTargetYaw !== null &&
        Math.abs(normalizeAngle(targetYaw - this.reversalTurnTargetYaw)) > 0.08;

      if (targetChanged) {
        this.reversalTurnTargetYaw = null;
        this.reversalTurnSign = 0;
      }

      if (Math.abs(deltaYaw) > Math.PI * 0.82) {
        if (this.reversalTurnSign === 0) {
          // Lock reversal direction once; recalculating this every frame can flip signs and jitter.
          const position = this.body.position;
          const cameraSideX = cameraPosition.x - position[0];
          const cameraSideZ = cameraPosition.z - position[2];
          const positiveTurnMidYaw = this.modelYaw + Math.PI / 2;
          const positiveTurnMidX = Math.sin(positiveTurnMidYaw);
          const positiveTurnMidZ = Math.cos(positiveTurnMidYaw);
          const cameraDot = positiveTurnMidX * cameraSideX + positiveTurnMidZ * cameraSideZ;
          this.reversalTurnTargetYaw = targetYaw;
          this.reversalTurnSign = Math.abs(cameraDot) > 0.001 ? Math.sign(cameraDot) : this.lastTurnSign;
        }

        deltaYaw = Math.abs(deltaYaw) * this.reversalTurnSign;
      } else if (Math.abs(deltaYaw) < 0.08) {
        this.reversalTurnTargetYaw = null;
        this.reversalTurnSign = 0;
      }

      const step = Math.max(-this.tuning.turnSpeed * dt, Math.min(this.tuning.turnSpeed * dt, deltaYaw));
      this.modelYaw += step;
      if (Math.abs(step) > 0.0001) {
        this.lastTurnSign = Math.sign(step);
      }
    } else {
      this.reversalTurnTargetYaw = null;
      this.reversalTurnSign = 0;
    }
  }

  private updateGround(world: World) {
    this.actualSlopeNormal = [0, 1, 0];
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
    rayOrigin[1] = position[1] - this.tuning.capsuleHalfHeight;
    rayOrigin[2] = position[2];

    const rayLength = this.tuning.capsuleRadius + 2;

    setIgnoreSingleBodyFilter(this.queryFilter, this.body.id);
    rayCollector.reset();
    castRay(world, rayCollector, raySettings, rayOrigin, [0, -1, 0], rayLength, this.queryFilter);
    resetIgnoreSingleBodyFilter(this.queryFilter);

    const hitDistance = rayCollector.hit.status === CastRayStatus.COLLIDING
      ? rayCollector.hit.fraction * rayLength
      : Infinity;

    if (hitDistance >= this.tuning.capsuleRadius + this.tuning.rayHitForgiveness) {
      this.isOnGround = false;
      this.groundBodyId = null;
      this.groundDistance = 0;
      return;
    }

    this.isOnGround = true;
    this.groundDistance = hitDistance;
    this.groundPosition = [rayOrigin[0], rayOrigin[1] - hitDistance, rayOrigin[2]];
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
        Math.max(-1, Math.min(1, vec3.dot(this.actualSlopeNormal, [0, 1, 0] as Vec3))),
      );
      this.canJump = this.actualSlopeAngle < this.tuning.maxSlopeAngle;
      if (this.canJump) {
        this.airJumpsRemaining = 1;
        this.airDashUsed = false;
      }
    }
  }

  private applyMovementImpulse(world: World) {
    const targetSpeed = this.tuning.maxRunSpeed;
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

    const air = this.canJump ? 1 : this.tuning.airControlFactor;
    const acceleration = 1 / Math.max(0.001, this.tuning.accelerationTime);

    moveImpulse[0] = deltaVelocity[0] * acceleration * air;
    moveImpulse[1] = 0;
    moveImpulse[2] = deltaVelocity[2] * acceleration * air;

    const position = this.body.position;
    impulsePoint[0] = position[0];
    impulsePoint[1] = position[1] + this.tuning.moveImpulsePointY;
    impulsePoint[2] = position[2];
    rigidBody.addImpulseAtPosition(world, this.body, moveImpulse, impulsePoint);
  }

  private applyDashVelocity(world: World, includeUpwardImpulse = false) {
    const velocity = this.body.motionProperties.linearVelocity;
    const dashDuration = Math.max(0.001, this.tuning.dashDuration);
    const dashSpeed = this.tuning.dashImpulse * Math.max(0, Math.min(1, this.dashTimer / dashDuration));

    // Dash input is locked, so speed decays across the committed dash instead of being re-applied flat.
    dashVelocity[0] = this.dashDirection[0] * dashSpeed;
    dashVelocity[1] = includeUpwardImpulse ? velocity[1] + this.tuning.dashUpwardImpulse : velocity[1];
    dashVelocity[2] = this.dashDirection[2] * dashSpeed;
    rigidBody.setLinearVelocity(world, this.body, dashVelocity);
  }

  private applyLandingDamping(world: World) {
    const velocity = this.body.motionProperties.linearVelocity;
    if (!this.wasOnGround && this.isOnGround && velocity[1] < 0) {
      // Landing should settle into contact instead of rebounding from downward velocity.
      rigidBody.setLinearVelocity(world, this.body, [
        velocity[0],
        velocity[1] * this.tuning.landingDamping,
        velocity[2],
      ]);
    }
  }

  private applyDragImpulse(world: World) {
    if (!this.canJump) {
      return;
    }
    const velocity = this.body.motionProperties.linearVelocity;
    dragImpulse[0] = -(velocity[0] - this.groundSurfaceVelocity[0]) * this.tuning.dragDampingC;
    dragImpulse[1] = 0;
    dragImpulse[2] = -(velocity[2] - this.groundSurfaceVelocity[2]) * this.tuning.dragDampingC;
    rigidBody.addImpulse(world, this.body, dragImpulse);
  }

  private applyGroundContactCorrection(world: World) {
    if (!this.isOnGround || this.groundBodyId === null) {
      return;
    }

    const velocity = this.body.motionProperties.linearVelocity;
    const contactError = this.tuning.capsuleRadius - this.groundDistance;
    if (contactError <= this.tuning.groundContactTolerance) {
      return;
    }

    const correctionVelocity = Math.min(contactError * this.tuning.groundedSnapSpeed, 2);
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

    vec3.cross(upCorrection, bodyUp, [0, 1, 0]);

    desiredForward[0] = Math.sin(this.modelYaw);
    desiredForward[1] = 0;
    desiredForward[2] = Math.cos(this.modelYaw);
    bodyForward[1] = 0;
    if (vec3.length(bodyForward) > 0.001) {
      vec3.normalize(bodyForward, bodyForward);
    }
    vec3.cross(yawCorrection, bodyForward, desiredForward);

    const angularVelocity = this.body.motionProperties.angularVelocity;
    balanceTorque[0] = upCorrection[0] * this.tuning.balanceSpringK - angularVelocity[0] * this.tuning.balanceDampingC;
    balanceTorque[1] = yawCorrection[1] * this.tuning.balanceYawSpringK - angularVelocity[1] * this.tuning.balanceYawDampingC;
    balanceTorque[2] = upCorrection[2] * this.tuning.balanceSpringK - angularVelocity[2] * this.tuning.balanceDampingC;

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
    rigidBody.setLinearVelocity(world, this.body, [velocity[0], this.tuning.jumpVelocity, velocity[2]]);
    this.jumpGroundIgnoreTimer = this.tuning.jumpGroundIgnoreTime;
    this.canJump = false;
    this.jumpStartAnimationTimer = JUMP_START_ANIMATION_SECONDS;
    this.landAnimationTimer = 0;
  }

  private updateGravityScale() {
    const verticalVelocity = this.body.motionProperties.linearVelocity[1];
    if (verticalVelocity < -this.tuning.maxFallSpeed) {
      this.body.motionProperties.gravityFactor = 0;
    } else if (verticalVelocity < 0 && !this.canJump) {
      this.body.motionProperties.gravityFactor = this.tuning.fallingGravityScale;
    } else {
      this.body.motionProperties.gravityFactor = this.tuning.normalGravityScale;
    }
  }

  syncVisual() {
    const position = this.body.position;
    this.object.position.set(position[0], position[1], position[2]);
    // Render with stable gameplay yaw; physics auto-balance can jitter while correcting capsule rotation.
    this.object.rotation.set(0, this.modelYaw, 0);
  }

  private updateDebugHelpers() {
    const position = this.body.position;
    this.groundRayHelper.position.set(position[0], position[1] - this.tuning.capsuleHalfHeight, position[2]);
    this.groundRayHelper.setLength(this.groundDistance > 0 ? this.groundDistance : 1);
    this.groundRayHelper.setColor(this.isOnGround ? 0x34e0a1 : 0xff3b30);

    if (this.isOnGround) {
      this.groundNormalHelper.position.set(
        this.groundPosition[0],
        this.groundPosition[1],
        this.groundPosition[2],
      );
      this.groundNormalHelper.setDirection(
        new THREE.Vector3(this.actualSlopeNormal[0], this.actualSlopeNormal[1], this.actualSlopeNormal[2]),
      );
    }
  }
}
