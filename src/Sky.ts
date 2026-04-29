import * as THREE from "three";

const SKY_RADIUS = 500;
const STAR_COUNT = 4000;

export function addSky(scene: THREE.Scene, sun: THREE.DirectionalLight) {
  scene.background = new THREE.Color(0x05050f);
  scene.fog = new THREE.Fog(0x05050f, 90, 200);
  scene.add(createStarField());

  const geometry = new THREE.SphereGeometry(SKY_RADIUS, 64, 32);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSunDirection: { value: sun.position.clone().normalize() },
      uSunColor: { value: sun.color },
    },
    vertexShader: `
      varying vec3 vWorldDirection;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldDirection = normalize(worldPosition.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDirection;
      uniform vec3 uSunColor;
      varying vec3 vWorldDirection;

      const float PI = 3.141592653589793;

      void main() {
        vec3 direction = normalize(vWorldDirection);
        vec3 lowerSpace = vec3(0.004, 0.004, 0.014);
        vec3 upperSpace = vec3(0.012, 0.016, 0.050);
        float verticalMix = smoothstep(-0.45, 0.85, direction.y);
        vec3 color = mix(lowerSpace, upperSpace, verticalMix);

        float galacticDust = pow(1.0 - abs(direction.y * 0.85 + direction.x * 0.16), 18.0) * 0.035;
        color += vec3(0.035, 0.045, 0.085) * galacticDust;

        float sunAmount = max(dot(direction, normalize(uSunDirection)), 0.0);
        float sunCore = smoothstep(0.99955, 0.99982, sunAmount);
        float sunCorona = pow(sunAmount, 10.0) * 0.5;
        float sunGlow = pow(sunAmount, 18.0) * 0.18;
        color += uSunColor * sunGlow;
        color += vec3(1.0, 0.54, 0.08) * sunCorona;
        color = mix(color, vec3(3.0, 2.55, 1.0), sunCore);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  material.toneMapped = false;

  const sky = new THREE.Mesh(geometry, material);
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  scene.add(sky);
}

function createStarField() {
  const positions = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 350 + Math.random() * 100;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.6,
    sizeAttenuation: true,
    fog: false,
  });

  return new THREE.Points(geometry, material);
}
