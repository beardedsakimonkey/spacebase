import {
  box,
  convexHull,
  MotionType,
  rigidBody,
  type Listener,
  type World,
} from "crashcat";
import type { Quat, Vec3 } from "mathcat";
import { quat } from "mathcat";
import * as THREE from "three";
import { platformerAsset } from "./assets";
import {
  addConveyorSegment,
  animateConveyorTextures,
  CONVEYOR_HALF_X,
  CONVEYOR_LONG_HALF_Z,
  createConveyorListener,
  loadConveyorModel,
} from "./Conveyor";
import { buildInstancedMesh, loadGltfMesh, loadGltfScene, type GltfMesh, type TileTransform } from "./util/kaykit";
import type { PhysicsEntity, PhysicsLayers } from "./physics";

type ModelTransform = TileTransform & {
  rx?: number;
  rz?: number;
  scale?: number;
};

type BarrierPlacement = TileTransform & {
  height: number;
};

const PLATFORM_HEIGHT = 4;
const PLATFORM_HALF_EXTENT = 3;
const BARRIER_HALF_THICKNESS = 0.5;
const RAILING_HALF_LENGTH = 1;
const RAILING_HALF_THICKNESS = 0.2;
const RAILING_COLLIDER_HEIGHT = 1.2;
const RAILING_LOCAL_CENTER_Z = -0.8;
const FLOOR_TOP = 0;
const SECOND_STORY_TOP = 4;
const BASE_XS = [-18, -12, -6, 0, 6, 12, 18];
const RED_BASE_ZS = [24, 30, 36, 42];
const BLUE_BASE_ZS = [-24, -30, -36, -42];
const RED_DECK_RAILING_XS = [-14, -12, -10, -8, -6, -4];
const BLUE_DECK_RAILING_XS = [4, 6, 8, 10, 12, 14];
const RED_DECK_RAILING_ZS = [32, 34, 36, 38, 40, 42];
const BLUE_DECK_RAILING_ZS = [-32, -34, -36, -38, -40, -42];
const CORRIDOR_ZS = [-18, -12, -6, 0, 6, 12, 18];
const RIGHT_BELT_X = PLATFORM_HALF_EXTENT + CONVEYOR_HALF_X;
const LEFT_BELT_X = -RIGHT_BELT_X;
const OUTER_CORRIDOR_X = RIGHT_BELT_X + CONVEYOR_HALF_X + PLATFORM_HALF_EXTENT;
const CORRIDOR_XS = [-OUTER_CORRIDOR_X, 0, OUTER_CORRIDOR_X];
const CORRIDOR_WALL_X = OUTER_CORRIDOR_X + PLATFORM_HALF_EXTENT + BARRIER_HALF_THICKNESS;
const Y_AXIS: Vec3 = [0, 1, 0];
const SKY_RADIUS = 500;
const STAR_COUNT = 4000;
const RAMP_COLLIDER_SHAPE = convexHull.create({
  positions: [
    -2, 0, -3,
    2, 0, -3,
    -2, SECOND_STORY_TOP, -3,
    2, SECOND_STORY_TOP, -3,
    -2, 0, 3,
    2, 0, 3,
    -2, 1, 3,
    2, 1, 3,
  ],
  convexRadius: 0.02,
});

export class Arena {
  readonly entities: PhysicsEntity[] = [];
  readonly listener: Listener = createConveyorListener();

  private bluePlatform6x6x4!: GltfMesh;
  private redPlatform6x6x4!: GltfMesh;
  private blueBarrierTall!: GltfMesh;
  private redBarrierTall!: GltfMesh;
  private yellowRailing!: GltfMesh;
  private blueConveyorLong!: THREE.Group;
  private redConveyorLong!: THREE.Group;
  private blueRamp!: THREE.Group;
  private redRamp!: THREE.Group;
  private conveyorTextures: THREE.Texture[] = [];

  private constructor(
    private readonly world: World,
    private readonly layers: PhysicsLayers,
    private readonly scene: THREE.Scene,
  ) {}

  static async create(world: World, layers: PhysicsLayers, scene: THREE.Scene): Promise<Arena> {
    const arena = new Arena(world, layers, scene);

    const sun = addLighting(scene);
    addSky(scene, sun);

    await arena.loadAssets();
    arena.buildFloorPlan();
    arena.buildConveyors();
    arena.buildBoundaryWalls();
    arena.buildRaisedDecks();

    return arena;
  }

  update(time: number, _dt: number) {
    animateConveyorTextures(this.conveyorTextures, time);
  }

  private async loadAssets() {
    const [
      platform6x6x4Blue,
      platform6x6x4Red,
      barrierTallBlue,
      barrierTallRed,
      railingYellow,
      conveyorLongBlue,
      conveyorLongRed,
      rampBlue,
      rampRed,
    ] = await Promise.all([
      loadGltfMesh(platformerAsset("blue", "platform_6x6x4")),
      loadGltfMesh(platformerAsset("red", "platform_6x6x4")),
      loadGltfMesh(platformerAsset("blue", "barrier_4x1x4")),
      loadGltfMesh(platformerAsset("red", "barrier_4x1x4")),
      loadGltfMesh(platformerAsset("yellow", "railing_straight_double")),
      loadConveyorModel(platformerAsset("blue", "conveyor_4x8x1")),
      loadConveyorModel(platformerAsset("red", "conveyor_4x8x1")),
      loadModel(platformerAsset("blue", "platform_slope_4x6x4")),
      loadModel(platformerAsset("red", "platform_slope_4x6x4")),
    ]);

    this.bluePlatform6x6x4 = platform6x6x4Blue;
    this.redPlatform6x6x4 = platform6x6x4Red;
    this.blueBarrierTall = barrierTallBlue;
    this.redBarrierTall = barrierTallRed;
    this.yellowRailing = railingYellow;
    this.blueConveyorLong = conveyorLongBlue.model;
    this.redConveyorLong = conveyorLongRed.model;
    this.blueRamp = rampBlue;
    this.redRamp = rampRed;
    this.conveyorTextures = [
      ...conveyorLongBlue.textures,
      ...conveyorLongRed.textures,
    ];
  }

  private buildFloorPlan() {
    const blueCorridorTiles: TileTransform[] = [];
    const redCorridorTiles: TileTransform[] = [];
    const blueTiles: TileTransform[] = [];
    const redTiles: TileTransform[] = [];

    for (const x of BASE_XS) {
      for (const z of BLUE_BASE_ZS) {
        addPlatformTile(this.world, this.layers, blueTiles, x, z, FLOOR_TOP);
      }
      for (const z of RED_BASE_ZS) {
        addPlatformTile(this.world, this.layers, redTiles, x, z, FLOOR_TOP);
      }
    }

    for (const x of CORRIDOR_XS) {
      for (const z of CORRIDOR_ZS) {
        const tiles = z < 0 ? blueCorridorTiles : redCorridorTiles;
        addPlatformTile(this.world, this.layers, tiles, x, z, FLOOR_TOP);
      }
    }

    addTiles(this.scene, this.bluePlatform6x6x4, blueTiles);
    addTiles(this.scene, this.redPlatform6x6x4, redTiles);
    addTiles(this.scene, this.bluePlatform6x6x4, blueCorridorTiles);
    addTiles(this.scene, this.redPlatform6x6x4, redCorridorTiles);
  }

  private buildConveyors() {
    const beltLanes = [
      { x: LEFT_BELT_X, ry: Math.PI },
      { x: RIGHT_BELT_X, ry: 0 },
    ];

    for (const lane of beltLanes) {
      for (const z of [0, -16, -8]) {
        addConveyorSegment(
          this.world,
          this.layers,
          this.scene,
          this.blueConveyorLong,
          lane.x,
          z,
          lane.ry,
          CONVEYOR_LONG_HALF_Z,
        );
      }

      for (const z of [8, 16, 0]) {
        addConveyorSegment(
          this.world,
          this.layers,
          this.scene,
          this.redConveyorLong,
          lane.x,
          z,
          lane.ry,
          CONVEYOR_LONG_HALF_Z,
        );
      }
    }
  }

  private buildBoundaryWalls() {
    const blueTall: BarrierPlacement[] = [];
    const redTall: BarrierPlacement[] = [];

    for (const x of [-18, -14, -10, -6, -2, 2, 6, 10, 14, 18]) {
      addBarrier(this.world, this.layers, blueTall, x, 0, -45.5, 0, 4);
      addBarrier(this.world, this.layers, redTall, x, 0, 45.5, 0, 4);
    }

    for (const z of [-44, -40, -36, -32, -28, -24]) {
      addBarrier(this.world, this.layers, blueTall, -21.5, 0, z, Math.PI / 2, 4);
      addBarrier(this.world, this.layers, blueTall, 21.5, 0, z, Math.PI / 2, 4);
    }

    for (const z of [24, 28, 32, 36, 40, 44]) {
      addBarrier(this.world, this.layers, redTall, -21.5, 0, z, Math.PI / 2, 4);
      addBarrier(this.world, this.layers, redTall, 21.5, 0, z, Math.PI / 2, 4);
    }

    for (const x of [-18, 18]) {
      addBarrier(this.world, this.layers, blueTall, x, 0, -21.5, 0, 4);
      addBarrier(this.world, this.layers, redTall, x, 0, 21.5, 0, 4);
    }

    for (const z of [-18, -14, -10, -6, -2]) {
      addBarrier(this.world, this.layers, blueTall, -CORRIDOR_WALL_X, 0, z, Math.PI / 2, 4);
      addBarrier(this.world, this.layers, blueTall, CORRIDOR_WALL_X, 0, z, Math.PI / 2, 4);
    }

    for (const z of [2, 6, 10, 14, 18]) {
      addBarrier(this.world, this.layers, redTall, -CORRIDOR_WALL_X, 0, z, Math.PI / 2, 4);
      addBarrier(this.world, this.layers, redTall, CORRIDOR_WALL_X, 0, z, Math.PI / 2, 4);
    }

    addTiles(this.scene, this.blueBarrierTall, blueTall);
    addTiles(this.scene, this.redBarrierTall, redTall);
  }

  private buildRaisedDecks() {
    const blueDeckTiles: TileTransform[] = [];
    const redDeckTiles: TileTransform[] = [];
    const blueRailings: TileTransform[] = [];
    const redRailings: TileTransform[] = [];

    for (const x of [-12, -6]) {
      for (const z of [34, 40]) {
        addPlatformTile(this.world, this.layers, redDeckTiles, x, z, SECOND_STORY_TOP);
      }
    }
    for (const x of [6, 12]) {
      for (const z of [-34, -40]) {
        addPlatformTile(this.world, this.layers, blueDeckTiles, x, z, SECOND_STORY_TOP);
      }
    }

    addRamp(this.world, this.layers, this.scene, this.redRamp, -9, 28, Math.PI);
    addRamp(this.world, this.layers, this.scene, this.blueRamp, 9, -28, 0);

    for (const x of RED_DECK_RAILING_XS) {
      addRailing(this.world, this.layers, redRailings, x, SECOND_STORY_TOP, 43.5, 0);
    }
    for (const z of RED_DECK_RAILING_ZS) {
      addRailing(this.world, this.layers, redRailings, -15.5, SECOND_STORY_TOP, z, Math.PI / 2);
      addRailing(this.world, this.layers, redRailings, -2.5, SECOND_STORY_TOP, z, Math.PI / 2);
    }

    for (const x of BLUE_DECK_RAILING_XS) {
      addRailing(this.world, this.layers, blueRailings, x, SECOND_STORY_TOP, -43.5, 0);
    }
    for (const z of BLUE_DECK_RAILING_ZS) {
      addRailing(this.world, this.layers, blueRailings, 15.5, SECOND_STORY_TOP, z, Math.PI / 2);
      addRailing(this.world, this.layers, blueRailings, 2.5, SECOND_STORY_TOP, z, Math.PI / 2);
    }

    addTiles(this.scene, this.redPlatform6x6x4, redDeckTiles);
    addTiles(this.scene, this.bluePlatform6x6x4, blueDeckTiles);
    addTiles(this.scene, this.yellowRailing, redRailings);
    addTiles(this.scene, this.yellowRailing, blueRailings);
  }
}

async function loadModel(path: string) {
  const model = await loadGltfScene(path);
  model.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  return model;
}

function addRamp(
  world: World,
  layers: PhysicsLayers,
  scene: THREE.Scene,
  model: THREE.Group,
  x: number,
  z: number,
  visualYaw: number,
) {
  addModelInstances(scene, model, [{ x, y: 0, z, ry: visualYaw }]);
  rigidBody.create(world, {
    shape: RAMP_COLLIDER_SHAPE,
    motionType: MotionType.STATIC,
    objectLayer: layers.terrain,
    position: [x, 0, z],
    quaternion: yawQuat(visualYaw),
    friction: 1.35,
    restitution: 0.04,
  });
}

function addPlatformTile(
  world: World,
  layers: PhysicsLayers,
  tiles: TileTransform[],
  x: number,
  z: number,
  top: number,
  halfExtent = PLATFORM_HALF_EXTENT,
) {
  tiles.push({ x, y: top - PLATFORM_HEIGHT, z });
  staticBox(world, layers.terrain, [halfExtent, PLATFORM_HEIGHT / 2, halfExtent], [x, top - PLATFORM_HEIGHT / 2, z], {
    friction: 1.45,
    restitution: 0.06,
  });
}

function addBarrier(
  world: World,
  layers: PhysicsLayers,
  tiles: BarrierPlacement[],
  x: number,
  y: number,
  z: number,
  ry: number,
  height: number,
) {
  tiles.push({ x, y, z, ry, height });
  staticBox(world, layers.terrain, [2, height / 2, BARRIER_HALF_THICKNESS], [x, y + height / 2, z], {
    quaternion: yawQuat(ry),
    friction: 0.75,
    restitution: 0.35,
  });
}

function addRailing(
  world: World,
  layers: PhysicsLayers,
  tiles: TileTransform[],
  x: number,
  y: number,
  z: number,
  ry: number,
) {
  const visualX = x - Math.sin(ry) * RAILING_LOCAL_CENTER_Z;
  const visualZ = z - Math.cos(ry) * RAILING_LOCAL_CENTER_Z;
  tiles.push({ x: visualX, y, z: visualZ, ry });

  staticBox(world, layers.terrain, [RAILING_HALF_LENGTH, RAILING_COLLIDER_HEIGHT / 2, RAILING_HALF_THICKNESS], [x, y + RAILING_COLLIDER_HEIGHT / 2, z], {
    quaternion: yawQuat(ry),
    friction: 0.75,
    restitution: 0.25,
  });
}

function addModelInstances(scene: THREE.Scene, source: THREE.Group, placements: ModelTransform[]) {
  for (const placement of placements) {
    const object = source.clone(true);
    object.position.set(placement.x, placement.y, placement.z);
    object.rotation.set(placement.rx ?? 0, placement.ry ?? 0, placement.rz ?? 0);
    if (placement.scale !== undefined) {
      object.scale.setScalar(placement.scale);
    }
    scene.add(object);
  }
}

function addTiles(scene: THREE.Scene, mesh: GltfMesh, tiles: TileTransform[]) {
  if (tiles.length === 0) {
    return;
  }
  scene.add(buildInstancedMesh(mesh, tiles));
}

function staticBox(
  world: World,
  layer: number,
  halfExtents: Vec3,
  position: Vec3,
  options: { quaternion?: Quat; friction?: number; restitution?: number } = {},
) {
  return rigidBody.create(world, {
    shape: box.create({ halfExtents }),
    motionType: MotionType.STATIC,
    objectLayer: layer,
    position,
    quaternion: options.quaternion,
    friction: options.friction ?? 1,
    restitution: options.restitution ?? 0.08,
  });
}

function yawQuat(yaw: number): Quat {
  const out = quat.create();
  quat.setAxisAngle(out, Y_AXIS, yaw);
  return out;
}

function addLighting(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0x8899cc, 0x221133, 2.0));

  const sun = new THREE.DirectionalLight(0xffff00, 1.5);
  sun.position.set(24, 32, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(4096);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.03;

  scene.add(sun);
  return sun;
}

function addSky(scene: THREE.Scene, sun: THREE.DirectionalLight) {
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
