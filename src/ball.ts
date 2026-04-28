import { rigidBody, sphere, MotionQuality, MotionType, type RigidBody, type World } from "crashcat";
import type { Vec3 } from "mathcat";
import * as THREE from "three";
import { platformerNeutralAsset } from "./assets";
import { loadGltfScene } from "./kaykit";
import type { PhysicsLayers } from "./physics";
import type { PlayerController } from "./player";

type BallTuning = {
  pickupRange: number;
  holdDistance: number;
  holdHeight: number;
  holdFollowStrength: number;
  throwStrength: number;
  throwMinPower: number;
  throwUpward: number;
};

export type BallTelemetry = {
  held: boolean;
  distance: number;
};

const spawnPosition: Vec3 = [0, 1.8, -2.5];
const ballVelocity: Vec3 = [0, 0, 0];
const zeroAngular: Vec3 = [0, 0, 0];
const launchDirection = new THREE.Vector3();
const spinAxis = new THREE.Vector3();
const fallbackDirection = new THREE.Vector3();

const BALL_TUNING: Readonly<BallTuning> = {
  pickupRange: 2.15,
  holdDistance: 1.25,
  holdHeight: 0.4,
  holdFollowStrength: 16,
  throwStrength: 34,
  throwMinPower: 0.45,
  throwUpward: 7,
};

export class BallController {
  readonly body: RigidBody;
  readonly object: THREE.Group;
  readonly tuning: Readonly<BallTuning>;

  private held = false;
  private pickupCooldown = 0;
  private readonly propLayer: number;
  private readonly heldLayer: number;
  private readonly target = new THREE.Vector3();
  private readonly playerPosition = new THREE.Vector3();
  private readonly playerForward = new THREE.Vector3();
  private readonly playerVelocity = new THREE.Vector3();

  constructor(world: World, layers: PhysicsLayers, scene: THREE.Scene, tuning = BALL_TUNING) {
    this.tuning = tuning;
    this.propLayer = layers.props;
    this.heldLayer = layers.heldProp;
    this.body = rigidBody.create(world, {
      shape: sphere.create({ radius: 0.52 }),
      motionType: MotionType.DYNAMIC,
      objectLayer: layers.props,
      position: spawnPosition,
      mass: 0.85,
      friction: 1.6,
      restitution: 0.55,
      linearDamping: 0.04,
      angularDamping: 0.2,
      motionQuality: MotionQuality.LINEAR_CAST,
    });

    this.object = new THREE.Group();
    scene.add(this.object);

    loadGltfScene(platformerNeutralAsset("ball")).then((model) => {
      // KayKit ball is radius 1; scale to match physics radius 0.52
      model.scale.setScalar(0.52);
      model.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });
      this.object.add(model);
    });
  }

  update(world: World, player: PlayerController, dt: number) {
    this.pickupCooldown = Math.max(0, this.pickupCooldown - dt);

    if (!this.held && this.pickupCooldown <= 0 && this.getDistanceToPlayer(player) <= this.tuning.pickupRange) {
      this.held = true;
      // Held balls keep a body for positioning, but move to a non-colliding layer so they do not block the player.
      rigidBody.setObjectLayer(world, this.body, this.heldLayer);
      rigidBody.setAngularVelocity(world, this.body, zeroAngular);
    }

    if (this.held) {
      player.getPosition(this.playerPosition);
      player.getForward(this.playerForward);
      this.target
        .copy(this.playerPosition)
        .addScaledVector(this.playerForward, this.tuning.holdDistance)
        .add(new THREE.Vector3(0, this.tuning.holdHeight, 0));

      const position = this.body.position;
      ballVelocity[0] = (this.target.x - position[0]) * this.tuning.holdFollowStrength;
      ballVelocity[1] = (this.target.y - position[1]) * this.tuning.holdFollowStrength;
      ballVelocity[2] = (this.target.z - position[2]) * this.tuning.holdFollowStrength;
      rigidBody.setLinearVelocity(world, this.body, ballVelocity);
      rigidBody.setAngularVelocity(world, this.body, zeroAngular);
    }

    this.syncVisual();

    if (this.body.position[1] < -14) {
      this.reset(world);
    }
  }

  drop(world: World) {
    if (this.held) {
      this.held = false;
      this.pickupCooldown = 0.8;
      rigidBody.setObjectLayer(world, this.body, this.propLayer);
      rigidBody.setAngularVelocity(world, this.body, zeroAngular);
    }
  }

  throw(world: World, player: PlayerController, direction: THREE.Vector3, power = 1) {
    if (!this.held) {
      return false;
    }

    this.computeThrowVelocity(ballVelocity, player, direction, power);
    this.held = false;
    this.pickupCooldown = 0.45;
    rigidBody.setObjectLayer(world, this.body, this.propLayer);
    rigidBody.setLinearVelocity(world, this.body, ballVelocity);
    spinAxis.set(launchDirection.x, 0, launchDirection.z);
    if (spinAxis.lengthSq() > 0.001) {
      spinAxis.normalize();
    }
    rigidBody.setAngularVelocity(world, this.body, [
      spinAxis.z * -8,
      0,
      spinAxis.x * 8,
    ]);
    return true;
  }

  computeThrowVelocity(out: Vec3, player: PlayerController, direction: THREE.Vector3, power: number) {
    launchDirection.copy(direction);
    if (launchDirection.lengthSq() < 0.001) {
      player.getForward(fallbackDirection);
      launchDirection.copy(fallbackDirection);
    }
    launchDirection.normalize();

    const clampedPower = THREE.MathUtils.clamp(power, 0, 1);
    // Charge maps into a floor-to-max range so quick releases still feel intentional.
    const throwPower = THREE.MathUtils.lerp(this.tuning.throwMinPower, 1, clampedPower);
    player.getVelocity(this.playerVelocity);
    out[0] = this.playerVelocity.x + launchDirection.x * this.tuning.throwStrength * throwPower;
    out[1] =
      this.playerVelocity.y * 0.25 +
      launchDirection.y * this.tuning.throwStrength * throwPower +
      this.tuning.throwUpward * throwPower;
    out[2] = this.playerVelocity.z + launchDirection.z * this.tuning.throwStrength * throwPower;
    return out;
  }

  reset(world: World) {
    this.held = false;
    this.pickupCooldown = 0;
    rigidBody.setObjectLayer(world, this.body, this.propLayer);
    rigidBody.setPosition(world, this.body, spawnPosition, false);
    rigidBody.setLinearVelocity(world, this.body, [0, 0, 0]);
    rigidBody.setAngularVelocity(world, this.body, [0, 0, 0]);
  }

  getTelemetry(player: PlayerController): BallTelemetry {
    return {
      held: this.held,
      distance: this.getDistanceToPlayer(player),
    };
  }

  isHeld() {
    return this.held;
  }

  getPosition(out = new THREE.Vector3()) {
    const position = this.body.position;
    return out.set(position[0], position[1], position[2]);
  }

  private getDistanceToPlayer(player: PlayerController) {
    player.getPosition(this.playerPosition);
    const position = this.body.position;
    return Math.hypot(position[0] - this.playerPosition.x, position[1] - this.playerPosition.y, position[2] - this.playerPosition.z);
  }

  syncVisual() {
    const position = this.body.position;
    const quaternion = this.body.quaternion;
    this.object.position.set(position[0], position[1], position[2]);
    this.object.quaternion.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
  }
}
