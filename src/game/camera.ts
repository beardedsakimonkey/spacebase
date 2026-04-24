import * as THREE from "three";

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

  private readonly target = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(48, aspect, 0.1, 180);
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  applyLookDelta(yawPixels: number, pitchPixels: number) {
    this.yaw -= yawPixels * 0.004;
    this.pitch = THREE.MathUtils.clamp(this.pitch - pitchPixels * 0.003, -1.1, 0.08);
  }

  update(_dt: number, focus: THREE.Vector3) {
    this.target.set(focus.x, focus.y + this.targetHeight, focus.z);

    const lowPitchT = THREE.MathUtils.smoothstep(this.pitch, -0.15, 0.18);
    const cameraDistance = THREE.MathUtils.lerp(this.distance, this.lowPitchDistance, lowPitchT);
    const horizontalDistance = Math.cos(this.pitch) * cameraDistance;
    this.desired.set(
      this.target.x + Math.sin(this.yaw) * horizontalDistance,
      this.target.y - Math.sin(this.pitch) * cameraDistance,
      this.target.z + Math.cos(this.yaw) * horizontalDistance,
    );

    this.camera.position.copy(this.desired);
    this.camera.lookAt(this.target);
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
