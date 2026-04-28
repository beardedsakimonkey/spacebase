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
  CONVEYOR_LONG_HALF_Z,
  CONVEYOR_SPEED,
  createConveyorListener,
  loadConveyorModel,
} from "./conveyor";
import { buildInstancedMesh, loadGltfMesh, loadGltfScene, type GltfMesh, type TileTransform } from "./kaykit";
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
const FLOOR_TOP = 0;
const SECOND_STORY_TOP = 4;
const BASE_XS = [-18, -12, -6, 0, 6, 12, 18];
const RED_BASE_ZS = [24, 30, 36, 42];
const BLUE_BASE_ZS = [-24, -30, -36, -42];
const CORRIDOR_ZS = [-18, -12, -6, 0, 6, 12, 18];
const LEFT_BELT_X = -5.1;
const RIGHT_BELT_X = 5.1;
const Y_AXIS: Vec3 = [0, 1, 0];
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

  private platform6x6x4!: GltfMesh;
  private bluePlatform6x6x4!: GltfMesh;
  private redPlatform6x6x4!: GltfMesh;
  private blueBarrierTall!: GltfMesh;
  private redBarrierTall!: GltfMesh;
  private blueBarrierLow!: GltfMesh;
  private redBarrierLow!: GltfMesh;
  private blueConveyorLong!: THREE.Group;
  private redConveyorLong!: THREE.Group;
  private blueRamp!: THREE.Group;
  private redRamp!: THREE.Group;
  private blueFlag!: THREE.Group;
  private redFlag!: THREE.Group;
  private conveyorTextures: THREE.Texture[] = [];

  private constructor(
    private readonly world: World,
    private readonly layers: PhysicsLayers,
    private readonly scene: THREE.Scene,
  ) {}

  static async create(world: World, layers: PhysicsLayers, scene: THREE.Scene): Promise<Arena> {
    const arena = new Arena(world, layers, scene);

    addLighting(scene);
    addSky(scene);

    await arena.loadAssets();
    arena.buildFloorPlan();
    arena.buildConveyors();
    arena.buildBoundaryWalls();
    arena.buildRaisedDecks();
    arena.buildBaseDecor();

    return arena;
  }

  update(time: number, _dt: number) {
    animateConveyorTextures(this.conveyorTextures, time);
  }

  private async loadAssets() {
    const [
      platform6x6x4,
      platform6x6x4Blue,
      platform6x6x4Red,
      barrierTallBlue,
      barrierTallRed,
      barrierLowBlue,
      barrierLowRed,
      conveyorLongBlue,
      conveyorLongRed,
      rampBlue,
      rampRed,
      flagBlue,
      flagRed,
    ] = await Promise.all([
      loadGltfMesh(platformerAsset("yellow", "platform_6x6x4")),
      loadGltfMesh(platformerAsset("blue", "platform_6x6x4")),
      loadGltfMesh(platformerAsset("red", "platform_6x6x4")),
      loadGltfMesh(platformerAsset("blue", "barrier_4x1x4")),
      loadGltfMesh(platformerAsset("red", "barrier_4x1x4")),
      loadGltfMesh(platformerAsset("blue", "barrier_4x1x2")),
      loadGltfMesh(platformerAsset("red", "barrier_4x1x2")),
      loadConveyorModel(platformerAsset("blue", "conveyor_4x8x1")),
      loadConveyorModel(platformerAsset("red", "conveyor_4x8x1")),
      loadModel(platformerAsset("blue", "platform_slope_4x6x4")),
      loadModel(platformerAsset("red", "platform_slope_4x6x4")),
      loadModel(platformerAsset("blue", "flag_C")),
      loadModel(platformerAsset("red", "flag_C")),
    ]);

    this.platform6x6x4 = platform6x6x4;
    this.bluePlatform6x6x4 = platform6x6x4Blue;
    this.redPlatform6x6x4 = platform6x6x4Red;
    this.blueBarrierTall = barrierTallBlue;
    this.redBarrierTall = barrierTallRed;
    this.blueBarrierLow = barrierLowBlue;
    this.redBarrierLow = barrierLowRed;
    this.blueConveyorLong = conveyorLongBlue.model;
    this.redConveyorLong = conveyorLongRed.model;
    this.blueRamp = rampBlue;
    this.redRamp = rampRed;
    this.blueFlag = flagBlue;
    this.redFlag = flagRed;
    this.conveyorTextures = [
      ...conveyorLongBlue.textures,
      ...conveyorLongRed.textures,
    ];
  }

  private buildFloorPlan() {
    const yellowTiles: TileTransform[] = [];
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

    for (const z of CORRIDOR_ZS) {
      const tiles = z < 0 ? blueTiles : z > 0 ? redTiles : yellowTiles;
      addPlatformTile(this.world, this.layers, tiles, 0, z, FLOOR_TOP);
    }

    addTiles(this.scene, this.platform6x6x4, yellowTiles);
    addTiles(this.scene, this.bluePlatform6x6x4, blueTiles);
    addTiles(this.scene, this.redPlatform6x6x4, redTiles);
  }

  private buildConveyors() {
    const beltLanes = [
      { x: LEFT_BELT_X, ry: Math.PI, velocity: [0, 0, CONVEYOR_SPEED] as Vec3 },
      { x: RIGHT_BELT_X, ry: 0, velocity: [0, 0, -CONVEYOR_SPEED] as Vec3 },
    ];

    for (const lane of beltLanes) {
      for (const z of [-16, -8]) {
        addConveyorSegment(
          this.world,
          this.layers,
          this.scene,
          this.blueConveyorLong,
          lane.x,
          z,
          lane.ry,
          CONVEYOR_LONG_HALF_Z,
          lane.velocity,
        );
      }

      for (const z of [8, 16]) {
        addConveyorSegment(
          this.world,
          this.layers,
          this.scene,
          this.redConveyorLong,
          lane.x,
          z,
          lane.ry,
          CONVEYOR_LONG_HALF_Z,
          lane.velocity,
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

    for (const x of [-18, -14, 14, 18]) {
      addBarrier(this.world, this.layers, blueTall, x, 0, -21.5, 0, 4);
      addBarrier(this.world, this.layers, redTall, x, 0, 21.5, 0, 4);
    }

    for (const z of [-18, -14, -10, -6, -2]) {
      addBarrier(this.world, this.layers, blueTall, -9.5, 0, z, Math.PI / 2, 4);
      addBarrier(this.world, this.layers, blueTall, 9.5, 0, z, Math.PI / 2, 4);
    }

    for (const z of [2, 6, 10, 14, 18]) {
      addBarrier(this.world, this.layers, redTall, -9.5, 0, z, Math.PI / 2, 4);
      addBarrier(this.world, this.layers, redTall, 9.5, 0, z, Math.PI / 2, 4);
    }

    addTiles(this.scene, this.blueBarrierTall, blueTall);
    addTiles(this.scene, this.redBarrierTall, redTall);
  }

  private buildRaisedDecks() {
    const blueDeckTiles: TileTransform[] = [];
    const redDeckTiles: TileTransform[] = [];
    const blueLowBarriers: BarrierPlacement[] = [];
    const redLowBarriers: BarrierPlacement[] = [];

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

    for (const x of [-13, -9, -5]) {
      addBarrier(this.world, this.layers, redLowBarriers, x, SECOND_STORY_TOP, 43.5, 0, 2);
    }
    for (const z of [35, 39]) {
      addBarrier(this.world, this.layers, redLowBarriers, -15.5, SECOND_STORY_TOP, z, Math.PI / 2, 2);
      addBarrier(this.world, this.layers, redLowBarriers, -2.5, SECOND_STORY_TOP, z, Math.PI / 2, 2);
    }

    for (const x of [5, 9, 13]) {
      addBarrier(this.world, this.layers, blueLowBarriers, x, SECOND_STORY_TOP, -43.5, 0, 2);
    }
    for (const z of [-35, -39]) {
      addBarrier(this.world, this.layers, blueLowBarriers, 15.5, SECOND_STORY_TOP, z, Math.PI / 2, 2);
      addBarrier(this.world, this.layers, blueLowBarriers, 2.5, SECOND_STORY_TOP, z, Math.PI / 2, 2);
    }

    addTiles(this.scene, this.redPlatform6x6x4, redDeckTiles);
    addTiles(this.scene, this.bluePlatform6x6x4, blueDeckTiles);
    addTiles(this.scene, this.redBarrierLow, redLowBarriers);
    addTiles(this.scene, this.blueBarrierLow, blueLowBarriers);
  }

  private buildBaseDecor() {
    addModelInstances(this.scene, this.redFlag, [{ x: 0, y: 0, z: 39, ry: Math.PI * 1.5 }]);
    addModelInstances(this.scene, this.blueFlag, [{ x: 0, y: 0, z: -39, ry: Math.PI / 2 }]);
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
) {
  tiles.push({ x, y: top - PLATFORM_HEIGHT, z });
  staticBox(world, layers.terrain, [3, PLATFORM_HEIGHT / 2, 3], [x, top - PLATFORM_HEIGHT / 2, z], {
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
  staticBox(world, layers.terrain, [2, height / 2, 0.5], [x, y + height / 2, z], {
    quaternion: yawQuat(ry),
    friction: 0.75,
    restitution: 0.35,
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
  scene.add(new THREE.HemisphereLight(0xdaf4ff, 0x564b8a, 2.0));

  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(24, 32, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 130;
  sun.shadow.camera.left = -58;
  sun.shadow.camera.right = 58;
  sun.shadow.camera.top = 68;
  sun.shadow.camera.bottom = -68;
  scene.add(sun);
}

function addSky(scene: THREE.Scene) {
  scene.background = new THREE.Color(0x60cfff);
  scene.fog = new THREE.Fog(0x60cfff, 90, 180);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(72, 0.16, 8, 192),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 }),
  );
  rim.position.set(0, 10, 0);
  rim.rotation.x = Math.PI / 2;
  scene.add(rim);
}
