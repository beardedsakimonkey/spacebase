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

export type Arena = {
  entities: PhysicsEntity[];
  listener: Listener;
  update(time: number, dt: number): void;
};

type TeamAssets = {
  platform6x6x4: GltfMesh;
  barrierTall: GltfMesh;
  barrierLow: GltfMesh;
  conveyorLong: THREE.Group;
  ramp: THREE.Group;
  flag: THREE.Group;
  archWide: THREE.Group;
  safetyNet: THREE.Group;
};

type ArenaAssets = {
  platform6x6x4: GltfMesh;
  blue: TeamAssets;
  red: TeamAssets;
  conveyorTextures: THREE.Texture[];
};

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

export async function createArena(world: World, layers: PhysicsLayers, scene: THREE.Scene): Promise<Arena> {
  const entities: PhysicsEntity[] = [];

  addLighting(scene);
  addSky(scene);

  const assets = await loadArenaAssets();
  buildFloorPlan(world, layers, scene, assets);
  buildConveyors(world, layers, scene, assets);
  buildBoundaryWalls(world, layers, scene, assets);
  buildRaisedDecks(world, layers, scene, assets);
  buildBaseDecor(scene, assets);

  return {
    entities,
    listener: createConveyorListener(),
    update(time: number) {
      animateConveyorTextures(assets.conveyorTextures, time);
    },
  };
}

async function loadArenaAssets(): Promise<ArenaAssets> {
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
    archWideBlue,
    archWideRed,
    safetyNetBlue,
    safetyNetRed,
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
    loadModel(platformerAsset("blue", "arch_wide")),
    loadModel(platformerAsset("red", "arch_wide")),
    loadModel(platformerAsset("blue", "safetynet_6x2x1")),
    loadModel(platformerAsset("red", "safetynet_6x2x1")),
  ]);

  return {
    platform6x6x4,
    blue: {
      platform6x6x4: platform6x6x4Blue,
      barrierTall: barrierTallBlue,
      barrierLow: barrierLowBlue,
      conveyorLong: conveyorLongBlue.model,
      ramp: rampBlue,
      flag: flagBlue,
      archWide: archWideBlue,
      safetyNet: safetyNetBlue,
    },
    red: {
      platform6x6x4: platform6x6x4Red,
      barrierTall: barrierTallRed,
      barrierLow: barrierLowRed,
      conveyorLong: conveyorLongRed.model,
      ramp: rampRed,
      flag: flagRed,
      archWide: archWideRed,
      safetyNet: safetyNetRed,
    },
    conveyorTextures: [
      ...conveyorLongBlue.textures,
      ...conveyorLongRed.textures,
    ],
  };
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

function buildFloorPlan(world: World, layers: PhysicsLayers, scene: THREE.Scene, assets: ArenaAssets) {
  const yellowTiles: TileTransform[] = [];
  const blueTiles: TileTransform[] = [];
  const redTiles: TileTransform[] = [];

  for (const x of BASE_XS) {
    for (const z of BLUE_BASE_ZS) {
      addPlatformTile(world, layers, blueTiles, x, z, FLOOR_TOP);
    }
    for (const z of RED_BASE_ZS) {
      addPlatformTile(world, layers, redTiles, x, z, FLOOR_TOP);
    }
  }

  for (const z of CORRIDOR_ZS) {
    const tiles = z < 0 ? blueTiles : z > 0 ? redTiles : yellowTiles;
    addPlatformTile(world, layers, tiles, 0, z, FLOOR_TOP);
  }

  addTiles(scene, assets.platform6x6x4, yellowTiles);
  addTiles(scene, assets.blue.platform6x6x4, blueTiles);
  addTiles(scene, assets.red.platform6x6x4, redTiles);
}

function buildConveyors(world: World, layers: PhysicsLayers, scene: THREE.Scene, assets: ArenaAssets) {
  const beltLanes = [
    { x: LEFT_BELT_X, ry: Math.PI, velocity: [0, 0, CONVEYOR_SPEED] as Vec3 },
    { x: RIGHT_BELT_X, ry: 0, velocity: [0, 0, -CONVEYOR_SPEED] as Vec3 },
  ];

  for (const lane of beltLanes) {
    for (const z of [-16, -8]) {
      addConveyorSegment(world, layers, scene, assets.blue.conveyorLong, lane.x, z, lane.ry, CONVEYOR_LONG_HALF_Z, lane.velocity);
    }

    for (const z of [8, 16]) {
      addConveyorSegment(world, layers, scene, assets.red.conveyorLong, lane.x, z, lane.ry, CONVEYOR_LONG_HALF_Z, lane.velocity);
    }
  }
}

function buildBoundaryWalls(world: World, layers: PhysicsLayers, scene: THREE.Scene, assets: ArenaAssets) {
  const blueTall: BarrierPlacement[] = [];
  const redTall: BarrierPlacement[] = [];

  for (const x of [-18, -14, -10, -6, -2, 2, 6, 10, 14, 18]) {
    addBarrier(world, layers, blueTall, x, 0, -45.5, 0, 4);
    addBarrier(world, layers, redTall, x, 0, 45.5, 0, 4);
  }

  for (const z of [-44, -40, -36, -32, -28, -24]) {
    addBarrier(world, layers, blueTall, -21.5, 0, z, Math.PI / 2, 4);
    addBarrier(world, layers, blueTall, 21.5, 0, z, Math.PI / 2, 4);
  }

  for (const z of [24, 28, 32, 36, 40, 44]) {
    addBarrier(world, layers, redTall, -21.5, 0, z, Math.PI / 2, 4);
    addBarrier(world, layers, redTall, 21.5, 0, z, Math.PI / 2, 4);
  }

  for (const x of [-18, -14, 14, 18]) {
    addBarrier(world, layers, blueTall, x, 0, -21.5, 0, 4);
    addBarrier(world, layers, redTall, x, 0, 21.5, 0, 4);
  }

  for (const z of [-18, -14, -10, -6, -2]) {
    addBarrier(world, layers, blueTall, -9.5, 0, z, Math.PI / 2, 4);
    addBarrier(world, layers, blueTall, 9.5, 0, z, Math.PI / 2, 4);
  }

  for (const z of [2, 6, 10, 14, 18]) {
    addBarrier(world, layers, redTall, -9.5, 0, z, Math.PI / 2, 4);
    addBarrier(world, layers, redTall, 9.5, 0, z, Math.PI / 2, 4);
  }

  addTiles(scene, assets.blue.barrierTall, blueTall);
  addTiles(scene, assets.red.barrierTall, redTall);
}

function buildRaisedDecks(world: World, layers: PhysicsLayers, scene: THREE.Scene, assets: ArenaAssets) {
  const blueDeckTiles: TileTransform[] = [];
  const redDeckTiles: TileTransform[] = [];
  const blueLowBarriers: BarrierPlacement[] = [];
  const redLowBarriers: BarrierPlacement[] = [];

  for (const x of [-12, -6]) {
    for (const z of [34, 40]) {
      addPlatformTile(world, layers, redDeckTiles, x, z, SECOND_STORY_TOP);
    }
  }
  for (const x of [6, 12]) {
    for (const z of [-34, -40]) {
      addPlatformTile(world, layers, blueDeckTiles, x, z, SECOND_STORY_TOP);
    }
  }

  addRamp(world, layers, scene, assets.red.ramp, -9, 28, Math.PI);
  addRamp(world, layers, scene, assets.blue.ramp, 9, -28, 0);

  for (const x of [-13, -9, -5]) {
    addBarrier(world, layers, redLowBarriers, x, SECOND_STORY_TOP, 43.5, 0, 2);
  }
  for (const z of [35, 39]) {
    addBarrier(world, layers, redLowBarriers, -15.5, SECOND_STORY_TOP, z, Math.PI / 2, 2);
    addBarrier(world, layers, redLowBarriers, -2.5, SECOND_STORY_TOP, z, Math.PI / 2, 2);
  }

  for (const x of [5, 9, 13]) {
    addBarrier(world, layers, blueLowBarriers, x, SECOND_STORY_TOP, -43.5, 0, 2);
  }
  for (const z of [-35, -39]) {
    addBarrier(world, layers, blueLowBarriers, 15.5, SECOND_STORY_TOP, z, Math.PI / 2, 2);
    addBarrier(world, layers, blueLowBarriers, 2.5, SECOND_STORY_TOP, z, Math.PI / 2, 2);
  }

  addTiles(scene, assets.red.platform6x6x4, redDeckTiles);
  addTiles(scene, assets.blue.platform6x6x4, blueDeckTiles);
  addTiles(scene, assets.red.barrierLow, redLowBarriers);
  addTiles(scene, assets.blue.barrierLow, blueLowBarriers);

  addModelInstances(scene, assets.red.safetyNet, [
    { x: -9, y: SECOND_STORY_TOP, z: 43.9 },
    { x: -15.9, y: SECOND_STORY_TOP, z: 37, ry: Math.PI / 2 },
  ]);
  addModelInstances(scene, assets.blue.safetyNet, [
    { x: 9, y: SECOND_STORY_TOP, z: -43.9, ry: Math.PI },
    { x: 15.9, y: SECOND_STORY_TOP, z: -37, ry: Math.PI / 2 },
  ]);
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

function buildBaseDecor(scene: THREE.Scene, assets: ArenaAssets) {
  addModelInstances(scene, assets.red.flag, [{ x: 0, y: 0, z: 39, ry: Math.PI * 1.5 }]);
  addModelInstances(scene, assets.blue.flag, [{ x: 0, y: 0, z: -39, ry: Math.PI / 2 }]);

  addModelInstances(scene, assets.red.archWide, [{ x: 0, y: 0, z: 21.2, ry: Math.PI }]);
  addModelInstances(scene, assets.blue.archWide, [{ x: 0, y: 0, z: -21.2 }]);
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
