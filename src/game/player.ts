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
import type { PhysicsLayers } from "./physics";

export type PlayerTuning = {
  capsuleRadius: number;
  capsuleHalfHeight: number;
  maxWalkSpeed: number;
  maxRunSpeed: number;
  accelerationTime: number;
  turnSpeed: number;
  turnVelMultiplier: number;
  airControlFactor: number;
  rejectVelMult: number;
  dragDampingC: number;
  moveImpulsePointY: number;
  playerFriction: number;
  maxSlopeAngle: number;
  enableAutoBalance: boolean;
  balanceSpringK: number;
  balanceDampingC: number;
  balanceYawSpringK: number;
  balanceYawDampingC: number;
  jumpVelocity: number;
  airJumpCount: number;
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
  wantToRun: boolean;
  wantToJump: boolean;
};

const rayCollector = createClosestCastRayCollector();
const raySettings = createDefaultCastRaySettings();
const ignoreSingleBodyFilterState = {
  bodyId: -1,
  innerBodyFilter: undefined as ((body: RigidBody) => boolean) | undefined,
};

const rayOrigin: Vec3 = vec3.create();
const movementDir: Vec3 = vec3.create();
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

export function createDefaultPlayerTuning(): PlayerTuning {
  return {
    capsuleRadius: 0.48,
    capsuleHalfHeight: 0.42,
    maxWalkSpeed: 7,
    maxRunSpeed: 11,
    accelerationTime: 7.5,
    turnSpeed: 9,
    turnVelMultiplier: 0.35,
    airControlFactor: 0.22,
    rejectVelMult: 3.5,
    dragDampingC: 0.18,
    moveImpulsePointY: 0.42,
    playerFriction: 0.35,
    maxSlopeAngle: 0.95,
    enableAutoBalance: true,
    balanceSpringK: 0.42,
    balanceDampingC: 0.16,
    balanceYawSpringK: 0.38,
    balanceYawDampingC: 0.08,
    jumpVelocity: 6.8,
    airJumpCount: 1,
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
}

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
  readonly tuning: PlayerTuning;

  private readonly queryFilter: Filter;
  private readonly faceGroup = new THREE.Group();
  private readonly debugGroup = new THREE.Group();
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
    wantToRun: false,
    wantToJump: false,
  };

  private modelYaw = 0;
  private characterRotated = true;
  private reversalTurnTargetYaw: number | null = null;
  private reversalTurnSign = 0;
  private lastTurnSign = 1;
  private isOnGround = false;
  private canJump = false;
  private wasOnGround = false;
  private isFalling = false;
  private actualSlopeNormal: Vec3 = vec3.fromValues(0, 1, 0);
  private actualSlopeAngle = 0;
  private groundBodyId: number | null = null;
  private groundSubShapeId = 0;
  private groundPosition: Vec3 = vec3.create();
  private groundDistance = 0;
  private dashTimer = 0;
  private dashCooldownTimer = 0;
  private readonly dashDirection: Vec3 = vec3.fromValues(0, 0, 1);
  private jumpGroundIgnoreTimer = 0;
  private jumpWasHeld = false;
  private airJumpsRemaining = 0;

  constructor(world: World, layers: PhysicsLayers, scene: THREE.Scene, tuning = createDefaultPlayerTuning()) {
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
      // MIN lets the player friction slider cap terrain contact grip instead of inheriting sticky surfaces.
      friction: tuning.playerFriction,
      frictionCombineMode: MaterialCombineMode.MIN,
      restitution: 0.05,
      linearDamping: 0,
      angularDamping: 0,
      mass: 1,
      // Dash speeds can cross thin walls in one tick; linear CCD sweeps the capsule along its motion.
      motionQuality: MotionQuality.LINEAR_CAST,
      allowedDegreesOfFreedom: tuning.enableAutoBalance ? 0b111111 : 0b111000,
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
    this.input.wantToRun = input.run;
    this.input.wantToJump = input.jump;
    vec3.set(this.input.moveDirection, cameraMoveDirection.x, 0, cameraMoveDirection.z);
    this.body.friction = this.tuning.playerFriction;

    this.updateModelYaw(dt, cameraPosition);
    this.updateGroundDetection(world);
    this.applyLandingDamping(world);
    this.updateGroundSurface(world);

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
    this.syncVisual();
    this.updateDebugHelpers();

    if (this.body.position[1] < -14) {
      this.reset(world);
    }
  }

  setDebugVisible(visible: boolean) {
    this.debugGroup.visible = visible;
  }

  applyBalanceMode(world: World) {
    this.body.motionProperties.allowedDegreesOfFreedom = this.tuning.enableAutoBalance ? 0b111111 : 0b111000;
    if (!this.tuning.enableAutoBalance) {
      rigidBody.setAngularVelocity(world, this.body, [0, 0, 0]);
    }
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
  }

  dash(world: World) {
    if (this.dashCooldownTimer > 0) {
      return false;
    }

    const forward = this.getForward();
    this.dashDirection[0] = forward.x;
    this.dashDirection[1] = 0;
    this.dashDirection[2] = forward.z;
    this.dashTimer = this.tuning.dashDuration;
    this.dashCooldownTimer = this.tuning.dashCooldown;
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

  private getMaxAirJumps() {
    return Math.max(0, Math.floor(this.tuning.airJumpCount));
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
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xff4fd8,
      roughness: 0.48,
      metalness: 0.02,
    });
    const bellyMaterial = new THREE.MeshStandardMaterial({
      color: 0x46c7ff,
      roughness: 0.55,
      metalness: 0.02,
    });
    const blackMaterial = new THREE.MeshStandardMaterial({
      color: 0x10142f,
      roughness: 0.6,
    });

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(this.tuning.capsuleRadius, this.tuning.capsuleHalfHeight * 2, 8, 18),
      bodyMaterial,
    );
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 10), bellyMaterial);
    belly.scale.set(0.95, 0.72, 0.18);
    belly.position.set(0, -0.06, 0.43);
    belly.castShadow = true;
    this.faceGroup.add(belly);

    for (const x of [-0.14, 0.14]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), blackMaterial);
      eye.position.set(x, 0.23, 0.51);
      this.faceGroup.add(eye);
    }

    group.add(this.faceGroup);
    return group;
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
      this.characterRotated = Math.abs(deltaYaw) < 0.03;
    } else {
      this.reversalTurnTargetYaw = null;
      this.reversalTurnSign = 0;
      this.characterRotated = true;
    }
  }

  private updateGroundDetection(world: World) {
    if (this.jumpGroundIgnoreTimer > 0) {
      // Fresh jumps ignore nearby ground so grounded snap cannot pull the player back down.
      this.isOnGround = false;
      this.canJump = false;
      this.groundBodyId = null;
      this.groundDistance = 0;
      this.actualSlopeAngle = 0;
      return;
    }

    const position = this.body.position;
    rayOrigin[0] = position[0];
    rayOrigin[1] = position[1] - this.tuning.capsuleHalfHeight;
    rayOrigin[2] = position[2];

    const rayLength = this.tuning.capsuleRadius + 2;
    const groundedDistance = this.tuning.capsuleRadius;

    setIgnoreSingleBodyFilter(this.queryFilter, this.body.id);
    rayCollector.reset();
    castRay(world, rayCollector, raySettings, rayOrigin, [0, -1, 0], rayLength, this.queryFilter);
    resetIgnoreSingleBodyFilter(this.queryFilter);

    if (rayCollector.hit.status === CastRayStatus.COLLIDING) {
      const hitDistance = rayCollector.hit.fraction * rayLength;
      if (hitDistance < groundedDistance + this.tuning.rayHitForgiveness) {
        this.isOnGround = true;
        this.groundDistance = hitDistance;
        this.groundPosition = [rayOrigin[0], rayOrigin[1] - hitDistance, rayOrigin[2]];
        this.groundBodyId = rayCollector.hit.bodyIdB;
        this.groundSubShapeId = rayCollector.hit.subShapeId;
        return;
      }
    }

    this.isOnGround = false;
    this.canJump = false;
    this.groundBodyId = null;
    this.groundDistance = 0;
    this.actualSlopeAngle = 0;
  }

  private updateGroundSurface(world: World) {
    if (!this.isOnGround) {
      this.actualSlopeNormal = [0, 1, 0];
      this.actualSlopeAngle = 0;
      this.canJump = false;
      return;
    }

    this.actualSlopeNormal = [0, 1, 0];
    this.actualSlopeAngle = 0;
    this.canJump = false;

    if (this.groundBodyId !== null) {
      // Ground state comes only from center contact; forward probes made ledges feel sticky.
      const groundBody = rigidBody.get(world, this.groundBodyId);
      if (groundBody) {
        rigidBody.getSurfaceNormal(this.actualSlopeNormal, groundBody, this.groundPosition, this.groundSubShapeId);
        this.actualSlopeAngle = Math.acos(
          Math.max(-1, Math.min(1, vec3.dot(this.actualSlopeNormal, [0, 1, 0] as Vec3))),
        );
        this.canJump = this.actualSlopeAngle < this.tuning.maxSlopeAngle;
        if (this.canJump) {
          this.airJumpsRemaining = this.getMaxAirJumps();
        }
      }
    }
  }

  private applyMovementImpulse(world: World) {
    movementDir[0] = Math.sin(this.modelYaw);
    movementDir[1] = 0;
    movementDir[2] = Math.cos(this.modelYaw);

    const targetSpeed = this.input.wantToRun ? this.tuning.maxRunSpeed : this.tuning.maxWalkSpeed;
    const currentVelocity = this.body.motionProperties.linearVelocity;

    currentHorizontal[0] = currentVelocity[0];
    currentHorizontal[1] = 0;
    currentHorizontal[2] = currentVelocity[2];

    desiredHorizontal[0] = movementDir[0] * targetSpeed;
    desiredHorizontal[1] = 0;
    desiredHorizontal[2] = movementDir[2] * targetSpeed;

    deltaVelocity[0] = desiredHorizontal[0] - currentHorizontal[0];
    deltaVelocity[1] = 0;
    deltaVelocity[2] = desiredHorizontal[2] - currentHorizontal[2];

    const control = this.characterRotated ? 1 : this.tuning.turnVelMultiplier;
    const air = this.canJump ? 1 : this.tuning.airControlFactor;
    const acceleration = 1 / Math.max(0.001, this.tuning.accelerationTime);

    moveImpulse[0] = deltaVelocity[0] * acceleration * control * air;
    moveImpulse[1] = 0;
    moveImpulse[2] = deltaVelocity[2] * acceleration * control * air;

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
    dragImpulse[0] = -velocity[0] * this.tuning.dragDampingC;
    dragImpulse[1] = 0;
    dragImpulse[2] = -velocity[2] * this.tuning.dragDampingC;
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
    if (!this.tuning.enableAutoBalance) {
      return;
    }

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

    if (!jumpPressed || !this.canUseJump()) {
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
  }

  private updateGravityScale() {
    const verticalVelocity = this.body.motionProperties.linearVelocity[1];
    this.isFalling = verticalVelocity < 0 && !this.canJump;

    if (verticalVelocity < -this.tuning.maxFallSpeed) {
      this.body.motionProperties.gravityFactor = 0;
    } else if (this.isFalling) {
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
    this.faceGroup.quaternion.identity();
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
