import * as THREE from "three";

export class ThrowChargeMeter {
  private readonly root = document.createElement("div");
  private readonly fill = document.createElement("div");

  constructor() {
    this.root.className = "throw-meter";
    const track = document.createElement("div");
    track.className = "throw-meter-track";
    this.fill.className = "throw-meter-fill";
    track.append(this.fill);
    this.root.append(track);
    document.body.append(this.root);
    this.setVisible(false);
    this.setPower(0);
  }

  setVisible(visible: boolean) {
    this.root.classList.toggle("is-visible", visible);
  }

  setPower(power: number) {
    const t = THREE.MathUtils.clamp(power, 0, 1);
    this.fill.style.transform = `scaleY(${Math.max(0.02, t)})`;
  }
}

export class TrajectoryPreview {
  private readonly points: THREE.Vector3[] = [];
  private geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(0, 0.01, 0)]), 1, 0.06, 8);
  private readonly material = new THREE.MeshBasicMaterial({
    color: 0x35ff8d,
    transparent: true,
    opacity: 0.9,
    depthTest: true,
    depthWrite: false,
  });
  private readonly mesh: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = 20;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  setVisible(visible: boolean) {
    this.mesh.visible = visible;
  }

  update(origin: THREE.Vector3, velocity: THREE.Vector3, gravityY: number) {
    this.points.length = 0;
    for (let i = 0; i < 26; i += 1) {
      const t = i * 0.075;
      this.points.push(
        new THREE.Vector3(
          origin.x + velocity.x * t,
          origin.y + velocity.y * t + 0.5 * gravityY * t * t,
          origin.z + velocity.z * t,
        ),
      );
    }

    this.geometry.dispose();
    this.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(this.points), 44, 0.09, 10);
    this.mesh.geometry = this.geometry;
  }
}
