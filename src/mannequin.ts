import * as THREE from "three";

export type MannequinBodyColor = "default" | "blue" | "green" | "yellow" | "red";

const BODY_COLOR_U: Record<Exclude<MannequinBodyColor, "default">, number> = {
  blue: 0.546,
  green: 0.688,
  yellow: 0.805,
  red: 0.921,
};
const BODY_COLOR_SOURCE_U = [BODY_COLOR_U.blue, BODY_COLOR_U.red] as const;
const BODY_COLOR_U_RADIUS = 0.085;
const BODY_COLOR_MAX_V = 0.45;

export function remapMannequinBodyColor(model: THREE.Group, color: MannequinBodyColor) {
  if (color === "default") {
    return;
  }

  const targetU = BODY_COLOR_U[color];
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) {
      return;
    }

    const uv = node.geometry.getAttribute("uv");
    if (!(uv instanceof THREE.BufferAttribute)) {
      return;
    }

    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      if (v > BODY_COLOR_MAX_V) {
        continue;
      }

      const sourceU = BODY_COLOR_SOURCE_U.find((candidate) => Math.abs(u - candidate) <= BODY_COLOR_U_RADIUS);
      if (sourceU === undefined) {
        continue;
      }

      uv.setX(i, THREE.MathUtils.clamp(targetU + (u - sourceU), 0, 1));
    }
    uv.needsUpdate = true;
  });
}
