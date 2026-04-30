import { rigidBody, sphere, MotionQuality, MotionType, type RigidBody, type World } from "crashcat";
import type { Vec3 } from "mathcat";
import * as THREE from "three";
import { platformerNeutralAsset } from "./assets";
import { loadGltfScene } from "./util/kaykit";
import type { PhysicsLayers } from "./physics";
import type { PlayerController } from "./Player";

const PICKUP_RANGE = 2.15;
const HOLD_DISTANCE = 1.25;
const HOLD_HEIGHT = 0.4;
const HOLD_FOLLOW_STRENGTH = 16;
const THROW_STRENGTH = 34;
const THROW_MIN_POWER = 0.45;
const THROW_UPWARD = 7;

const spawnPosition: Vec3 = [0, 1.8, -2.5];
const ballVelocity: Vec3 = [0, 0, 0];
const zeroAngular: Vec3 = [0, 0, 0];
const launchDirection = new THREE.Vector3();
const spinAxis = new THREE.Vector3();
const fallbackDirection = new THREE.Vector3();

export class BallController {
  readonly body: RigidBody;
  readonly object: THREE.Group;

  private held = false;
  private pickupCooldown = 0;
  private readonly propLayer: number;
  private readonly heldLayer: number;
  private readonly target = new THREE.Vector3();
  private readonly playerPosition = new THREE.Vector3();
  private readonly playerForward = new THREE.Vector3();
  private readonly playerVelocity = new THREE.Vector3();

  constructor(world: World, layers: PhysicsLayers, scene: THREE.Scene) {
    this.propLayer = layers.props;
    this.heldLayer = layers.heldProp;
    this.body = rigidBody.create(world, {
      shape: sphere.create({ radius: 1 }),
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

    if (!this.held && this.pickupCooldown <= 0 && this.getDistanceToPlayer(player) <= PICKUP_RANGE) {
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
        .addScaledVector(this.playerForward, HOLD_DISTANCE)
        .add(new THREE.Vector3(0, HOLD_HEIGHT, 0));

      const position = this.body.position;
      ballVelocity[0] = (this.target.x - position[0]) * HOLD_FOLLOW_STRENGTH;
      ballVelocity[1] = (this.target.y - position[1]) * HOLD_FOLLOW_STRENGTH;
      ballVelocity[2] = (this.target.z - position[2]) * HOLD_FOLLOW_STRENGTH;
      rigidBody.setLinearVelocity(world, this.body, ballVelocity);
      rigidBody.setAngularVelocity(world, this.body, zeroAngular);
    }

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
    const throwPower = THREE.MathUtils.lerp(THROW_MIN_POWER, 1, clampedPower);
    player.getVelocity(this.playerVelocity);
    out[0] = this.playerVelocity.x + launchDirection.x * THROW_STRENGTH * throwPower;
    out[1] =
      this.playerVelocity.y * 0.25 +
      launchDirection.y * THROW_STRENGTH * throwPower +
      THROW_UPWARD * throwPower;
    out[2] = this.playerVelocity.z + launchDirection.z * THROW_STRENGTH * throwPower;
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
