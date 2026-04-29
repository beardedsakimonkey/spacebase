import {
  CastShapeStatus,
  castShape,
  createClosestCastShapeCollector,
  createDefaultCastShapeSettings,
  filter,
  sphere,
  type Filter,
  type World,
} from "crashcat";
import type { Quat, Vec3 } from "mathcat";
import { quat, vec3 } from "mathcat";
import * as THREE from "three";
import type { PhysicsLayers } from "./physics";

const FORWARD = new THREE.Vector3();
const RIGHT = new THREE.Vector3();
const POINTER_RAY = new THREE.Vector3();

export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  yaw = Math.PI * 0.22;
  pitch = -0.55;
  distance = 12;
  lowPitchDistance = 8.4;
  targetHeight = 1.25;

  private readonly obstructionRadius = 0.35;
  private readonly obstructionPadding = 0.2;
  private readonly minimumEmergencyDistance = 0.75;
  private readonly obstructionSmoothingSpeed = 16;
  private readonly restoreSmoothingSpeed = 8;

  private readonly target = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly targetToCamera = new THREE.Vector3();
  private readonly obstructionShape = sphere.create({ radius: this.obstructionRadius });
  private readonly obstructionCollector = createClosestCastShapeCollector();
  private readonly obstructionSettings = createDefaultCastShapeSettings();
  private readonly obstructionFilter: Filter;
  private readonly castPosition: Vec3 = vec3.create();
  private readonly castQuaternion: Quat = quat.create();
  private readonly castScale: Vec3 = vec3.fromValues(1, 1, 1);
  private readonly castDisplacement: Vec3 = vec3.create();

  private resolvedDistance = this.distance;
  private wasObstructed = false;

  constructor(aspect: number, private readonly world: World, layers: PhysicsLayers) {
    this.camera = new THREE.PerspectiveCamera(48, aspect, 0.1, 600);
    this.obstructionFilter = filter.create(world.settings.layers);
    filter.disableAllLayers(this.obstructionFilter, world.settings.layers);
    filter.enableObjectLayer(this.obstructionFilter, world.settings.layers, layers.terrain);
    this.obstructionSettings.collideWithBackfaces = true;
    this.obstructionSettings.collideOnlyWithActiveEdges = false;
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  applyLookDelta(yawPixels: number, pitchPixels: number) {
    this.yaw -= yawPixels * 0.004;
    this.pitch = THREE.MathUtils.clamp(this.pitch - pitchPixels * 0.003, -1.1, 0.08);
  }

  update(dt: number, focus: THREE.Vector3) {
    this.target.set(focus.x, focus.y + this.targetHeight, focus.z);

    const lowPitchT = THREE.MathUtils.smoothstep(this.pitch, -0.15, 0.18);
    const cameraDistance = THREE.MathUtils.lerp(this.distance, this.lowPitchDistance, lowPitchT);
    const horizontalDistance = Math.cos(this.pitch) * cameraDistance;
    this.desired.set(
      this.target.x + Math.sin(this.yaw) * horizontalDistance,
      this.target.y - Math.sin(this.pitch) * cameraDistance,
      this.target.z + Math.cos(this.yaw) * horizontalDistance,
    );
    this.targetToCamera.copy(this.desired).sub(this.target).normalize();

    const visibleDistance = this.getTerrainVisibleDistance(cameraDistance);
    const resolvedDistance = this.resolveCameraDistance(dt, cameraDistance, visibleDistance);
    this.desired.copy(this.target).addScaledVector(this.targetToCamera, resolvedDistance);

    this.camera.position.copy(this.desired);
    this.camera.lookAt(this.target);
  }

  private getTerrainVisibleDistance(idealDistance: number) {
    this.castPosition[0] = this.target.x;
    this.castPosition[1] = this.target.y;
    this.castPosition[2] = this.target.z;
    this.castDisplacement[0] = this.targetToCamera.x * idealDistance;
    this.castDisplacement[1] = this.targetToCamera.y * idealDistance;
    this.castDisplacement[2] = this.targetToCamera.z * idealDistance;

    this.obstructionCollector.reset();
    castShape(
      this.world,
      this.obstructionCollector,
      this.obstructionSettings,
      this.obstructionShape,
      this.castPosition,
      this.castQuaternion,
      this.castScale,
      this.castDisplacement,
      this.obstructionFilter,
    );

    if (this.obstructionCollector.hit.status !== CastShapeStatus.COLLIDING) {
      return idealDistance;
    }

    const hitDistance = this.obstructionCollector.hit.fraction * idealDistance;
    return THREE.MathUtils.clamp(
      hitDistance - this.obstructionPadding,
      this.minimumEmergencyDistance,
      idealDistance,
    );
  }

  private resolveCameraDistance(dt: number, idealDistance: number, visibleDistance: number) {
    const isObstructed = visibleDistance < idealDistance - 0.001;

    if (isObstructed) {
      this.resolvedDistance = this.smoothDistance(
        this.resolvedDistance,
        visibleDistance,
        dt,
        this.obstructionSmoothingSpeed,
      );
      if (Math.abs(this.resolvedDistance - visibleDistance) < 0.01) {
        this.resolvedDistance = visibleDistance;
      }
      this.wasObstructed = true;
      return this.resolvedDistance;
    }

    if (this.wasObstructed && this.resolvedDistance < idealDistance) {
      this.resolvedDistance = this.smoothDistance(
        this.resolvedDistance,
        idealDistance,
        dt,
        this.restoreSmoothingSpeed,
      );
      if (idealDistance - this.resolvedDistance < 0.01) {
        this.resolvedDistance = idealDistance;
        this.wasObstructed = false;
      }
      return this.resolvedDistance;
    }

    this.resolvedDistance = idealDistance;
    this.wasObstructed = false;
    return this.resolvedDistance;
  }

  private smoothDistance(from: number, to: number, dt: number, speed: number) {
    const t = 1 - Math.exp(-speed * dt);
    return THREE.MathUtils.lerp(from, to, t);
  }

  getMoveDirection(
    forwardAmount: number,
    rightAmount: number,
    out = new THREE.Vector3(),
  ): THREE.Vector3 {
    this.camera.getWorldDirection(FORWARD);
    FORWARD.y = 0;
    FORWARD.normalize();

    RIGHT.crossVectors(FORWARD, this.camera.up).normalize();
    out.copy(FORWARD).multiplyScalar(forwardAmount).addScaledVector(RIGHT, rightAmount);

    if (out.lengthSq() > 0.0001) {
      out.normalize();
    } else {
      out.set(0, 0, 0);
    }

    return out;
  }

  getPointerRayDirection(
    pointer: { x: number; y: number },
    element: HTMLElement,
    out = POINTER_RAY,
  ) {
    const rect = element.getBoundingClientRect();
    const x = ((pointer.x - rect.left) / rect.width) * 2 - 1;
    const y = -((pointer.y - rect.top) / rect.height) * 2 + 1;

    return out
      .set(x, y, 0.5)
      .unproject(this.camera)
      .sub(this.camera.position)
      .normalize();
  }
}
