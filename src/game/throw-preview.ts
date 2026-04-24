import * as THREE from "three";

export class ThrowChargeMeter {
  private readonly root = document.createElement("div");
  private readonly knob = document.createElementNS("http://www.w3.org/2000/svg", "circle");

  constructor() {
    this.root.className = "throw-meter";
    this.root.innerHTML = `
      <svg viewBox="0 0 120 180" aria-hidden="true">
        <path class="throw-meter-track" d="M 28 156 Q 34 68 96 24" />
      </svg>
    `;

    const svg = this.root.querySelector("svg");
    if (!svg) {
      throw new Error("Missing throw meter svg.");
    }
    this.knob.setAttribute("class", "throw-meter-knob");
    this.knob.setAttribute("r", "8");
    svg.append(this.knob);
    document.body.append(this.root);
    this.setVisible(false);
    this.setPower(0);
  }

  setVisible(visible: boolean) {
    this.root.classList.toggle("is-visible", visible);
  }

  setPower(power: number) {
    const t = THREE.MathUtils.clamp(power, 0, 1);
    const inv = 1 - t;
    const x = inv * inv * 28 + 2 * inv * t * 34 + t * t * 96;
    const y = inv * inv * 156 + 2 * inv * t * 68 + t * t * 24;
    this.knob.setAttribute("cx", x.toFixed(2));
    this.knob.setAttribute("cy", y.toFixed(2));
  }
}

export class TrajectoryPreview {
  private readonly points: THREE.Vector3[] = [];
  private geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(0, 0.01, 0)]), 1, 0.06, 8);
  private readonly material = new THREE.MeshBasicMaterial({
    color: 0x35ff8d,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
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
