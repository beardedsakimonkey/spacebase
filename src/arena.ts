import { box, MotionType, rigidBody, type RigidBody, type World } from "crashcat";
import type { Quat, Vec3 } from "mathcat";
import { quat } from "mathcat";
import * as THREE from "three";
import { ASSETS } from "./assets";
import { buildInstancedMesh, loadGltfMesh, type GltfMesh, type TileTransform } from "./kaykit";
import type { PhysicsEntity, PhysicsLayers } from "./physics";

export type Arena = {
  entities: PhysicsEntity[];
  update(time: number, dt: number): void;
};

type ArenaAssets = {
  platform6x6x4: GltfMesh;
  platform6x6x4Blue: GltfMesh;
  platform6x6x4Red: GltfMesh;
  barrierTall: GltfMesh;
  barrierLow: GltfMesh;
};

type Slider = {
  body: RigidBody;
  base: Vec3;
  axis: "x" | "z";
  amplitude: number;
  speed: number;
  phase: number;
  yaw: number;
};

type SliderConfig = Omit<Slider, "body">;

type SpinnerArm = {
  body: RigidBody;
  yawOffset: number;
};

const FIELD_HALF_X = 24;
const FIELD_HALF_Z = 21;
const PLATFORM_HEIGHT = 4;
const PLATFORM_BASE_Y = -PLATFORM_HEIGHT;
const raisedFieldTops = new Map<string, number>([
  ["-15,-12", 1.0],
  ["15,-12", 1.55],
  ["-9,0", 0.9],
  ["9,0", 1.35],
  ["-15,12", 1.15],
  ["15,12", 1.7],
]);
const Y_AXIS: Vec3 = [0, 1, 0];
const tmpQuat = quat.create();
const tmpPos: Vec3 = [0, 0, 0];

export async function createArena(world: World, layers: PhysicsLayers, scene: THREE.Scene): Promise<Arena> {
  const entities: PhysicsEntity[] = [];
  const sliders: Slider[] = [];
  const spinnerArms: SpinnerArm[] = [];

  addLighting(scene);
  addSky(scene);

  const assets = await loadArenaAssets();

  buildPlatformField(world, layers, scene, assets);
  buildBoundaryWalls(world, layers, scene, assets);
  buildFutureGoalMouths(world, layers, scene, assets);
  buildKinematicToys(world, layers, scene, assets, entities, sliders, spinnerArms);

  return {
    entities,
    update(time: number, dt: number) {
      for (const slider of sliders) {
        const offset = Math.sin(time * slider.speed + slider.phase) * slider.amplitude;
        tmpPos[0] = slider.base[0] + (slider.axis === "x" ? offset : 0);
        tmpPos[1] = slider.base[1];
        tmpPos[2] = slider.base[2] + (slider.axis === "z" ? offset : 0);
        quat.setAxisAngle(tmpQuat, Y_AXIS, slider.yaw);
        rigidBody.moveKinematic(slider.body, tmpPos, tmpQuat, dt);
      }

      for (const arm of spinnerArms) {
        quat.setAxisAngle(tmpQuat, Y_AXIS, time * 1.15 + arm.yawOffset);
        rigidBody.moveKinematic(arm.body, [0, 1, 11], tmpQuat, dt);
      }
    },
  };
}

function candyRed(mesh: GltfMesh): GltfMesh {
  const material = mesh.material.clone();

  if (material instanceof THREE.MeshStandardMaterial) {
    material.color.set(0xffffff);      // saturated candy red multiplier
    material.roughness = 0.32;         // glossier
    material.metalness = 0.0;
    material.emissive.set(0x3a0006);   // tiny color lift in shadows
    material.emissiveIntensity = 0.08;
  }

  return { ...mesh, material };
}

async function loadArenaAssets(): Promise<ArenaAssets> {
  const [
    platform6x6x4,
    platform6x6x4Blue,
    platform6x6x4Red,
    barrierTall,
    barrierLow,
  ] = await Promise.all([
    loadGltfMesh(ASSETS.platform_yellow),
    loadGltfMesh(ASSETS.platform_blue),
    loadGltfMesh(ASSETS.platform_red),
    loadGltfMesh(ASSETS.barrier_tall),
    loadGltfMesh(ASSETS.barrier_low),
  ]);

  return {
    platform6x6x4,
    platform6x6x4Blue,
    platform6x6x4Red,
    barrierTall: candyRed(barrierTall),
    barrierLow: candyRed(barrierLow),
  };
}

function buildPlatformField(world: World, layers: PhysicsLayers, scene: THREE.Scene, assets: ArenaAssets) {
  staticBox(world, layers.terrain, [FIELD_HALF_X, PLATFORM_HEIGHT / 2, FIELD_HALF_Z], [0, -2, 0], {
    friction: 1.8,
    restitution: 0.06,
  });

  const yellowTiles: TileTransform[] = [];
  const blueTiles: TileTransform[] = [];
  const redTiles: TileTransform[] = [];

  for (let x = -21; x <= 21; x += 6) {
    for (let z = -18; z <= 18; z += 6) {
      const top = raisedFieldTops.get(`${x},${z}`) ?? 0;
      const tile: TileTransform = { x, y: top > 0 ? top - PLATFORM_HEIGHT : PLATFORM_BASE_Y, z };
      if (top > 0) {
        staticBox(world, layers.terrain, [3, PLATFORM_HEIGHT / 2, 3], [x, top - PLATFORM_HEIGHT / 2, z], {
          friction: 1.35,
          restitution: 0.08,
        });
      }

      if (z <= -12) {
        blueTiles.push(tile);
      } else if (z >= 12) {
        redTiles.push(tile);
      } else {
        yellowTiles.push(tile);
      }
    }
  }
  addTiles(scene, assets.platform6x6x4, yellowTiles);
  addTiles(scene, assets.platform6x6x4Blue, blueTiles);
  addTiles(scene, assets.platform6x6x4Red, redTiles);
}

function buildBoundaryWalls(world: World, layers: PhysicsLayers, scene: THREE.Scene, assets: ArenaAssets) {
  staticBox(world, layers.terrain, [0.55, 2, FIELD_HALF_Z + 1], [-FIELD_HALF_X - 0.55, 2, 0], {
    friction: 0.75,
    restitution: 0.35,
  });
  staticBox(world, layers.terrain, [0.55, 2, FIELD_HALF_Z + 1], [FIELD_HALF_X + 0.55, 2, 0], {
    friction: 0.75,
    restitution: 0.35,
  });
  staticBox(world, layers.terrain, [FIELD_HALF_X + 0.7, 2, 0.55], [0, 2, -FIELD_HALF_Z - 0.55], {
    friction: 0.75,
    restitution: 0.35,
  });
  staticBox(world, layers.terrain, [FIELD_HALF_X + 0.7, 2, 0.55], [0, 2, FIELD_HALF_Z + 0.55], {
    friction: 0.75,
    restitution: 0.35,
  });

  const wallTiles: TileTransform[] = [];
  for (let z = -20; z <= 20; z += 4) {
    wallTiles.push({ x: -FIELD_HALF_X - 0.55, y: 0, z, ry: Math.PI / 2 });
    wallTiles.push({ x: FIELD_HALF_X + 0.55, y: 0, z, ry: Math.PI / 2 });
  }
  for (let x = -22; x <= 22; x += 4) {
    wallTiles.push({ x, y: 0, z: -FIELD_HALF_Z - 0.55 });
    wallTiles.push({ x, y: 0, z: FIELD_HALF_Z + 0.55 });
  }
  addTiles(scene, assets.barrierTall, wallTiles);
}


function buildFutureGoalMouths(world: World, layers: PhysicsLayers, scene: THREE.Scene, assets: ArenaAssets) {
  const sideBarriers: TileTransform[] = [
    { x: -8, y: 0, z: -18.5 },
    { x: 8, y: 0, z: -18.5 },
    { x: -8, y: 0, z: 18.5 },
    { x: 8, y: 0, z: 18.5 },
    { x: -10.5, y: 0, z: -16, ry: Math.PI / 2 },
    { x: 10.5, y: 0, z: -16, ry: Math.PI / 2 },
    { x: -10.5, y: 0, z: 16, ry: Math.PI / 2 },
    { x: 10.5, y: 0, z: 16, ry: Math.PI / 2 },
  ];

  for (const barrier of sideBarriers) {
    staticBox(world, layers.terrain, [2, 1, 0.5], [barrier.x, 1, barrier.z], {
      quaternion: yawQuat(barrier.ry ?? 0),
      friction: 0.8,
      restitution: 0.32,
    });
  }
  addTiles(scene, assets.barrierLow, sideBarriers);
}

function buildKinematicToys(
  world: World,
  layers: PhysicsLayers,
  scene: THREE.Scene,
  assets: ArenaAssets,
  entities: PhysicsEntity[],
  sliders: Slider[],
  spinnerArms: SpinnerArm[],
) {
  sliders.push(createSlidingBarrier(world, layers, scene, assets.barrierLow, entities, {
    base: [0, 1, -12],
    axis: "x",
    amplitude: 8,
    speed: 0.75,
    phase: 0,
    yaw: 0,
  }));

  sliders.push(createSlidingBarrier(world, layers, scene, assets.barrierLow, entities, {
    base: [-18, 1, 6],
    axis: "z",
    amplitude: 4.5,
    speed: 0.95,
    phase: Math.PI / 2,
    yaw: Math.PI / 2,
  }));

  spinnerArms.push(createSpinnerArm(world, layers, scene, assets.barrierLow, entities, 0));
  spinnerArms.push(createSpinnerArm(world, layers, scene, assets.barrierLow, entities, Math.PI / 2));

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.75, 0.9, 1.2, 24),
    new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.42 }),
  );
  hub.position.set(0, 0.6, 11);
  hub.castShadow = true;
  hub.receiveShadow = true;
  scene.add(hub);
}

function createSlidingBarrier(
  world: World,
  layers: PhysicsLayers,
  scene: THREE.Scene,
  mesh: GltfMesh,
  entities: PhysicsEntity[],
  config: SliderConfig,
): Slider {
  const bodyQuat = yawQuat(config.yaw);
  const body = rigidBody.create(world, {
    shape: box.create({ halfExtents: [2, 1, 0.5] }),
    motionType: MotionType.KINEMATIC,
    objectLayer: layers.kinematic,
    position: config.base,
    quaternion: bodyQuat,
    friction: 0.5,
    restitution: 0.55,
  });

  const object = new THREE.Group();
  object.add(buildInstancedMesh(mesh, [{ x: 0, y: -1, z: 0 }]));
  object.position.set(config.base[0], config.base[1], config.base[2]);
  object.quaternion.set(bodyQuat[0], bodyQuat[1], bodyQuat[2], bodyQuat[3]);
  scene.add(object);
  entities.push({ body, object });

  return { ...config, body };
}

function createSpinnerArm(
  world: World,
  layers: PhysicsLayers,
  scene: THREE.Scene,
  mesh: GltfMesh,
  entities: PhysicsEntity[],
  yawOffset: number,
): SpinnerArm {
  const bodyQuat = yawQuat(yawOffset);
  const body = rigidBody.create(world, {
    shape: box.create({ halfExtents: [4.1, 1, 0.5] }),
    motionType: MotionType.KINEMATIC,
    objectLayer: layers.kinematic,
    position: [0, 1, 11],
    quaternion: bodyQuat,
    friction: 0.35,
    restitution: 0.65,
  });

  const object = new THREE.Group();
  object.add(buildInstancedMesh(mesh, [
    { x: -2, y: -1, z: 0 },
    { x: 2, y: -1, z: 0 },
  ]));
  object.position.set(0, 1, 11);
  object.quaternion.set(bodyQuat[0], bodyQuat[1], bodyQuat[2], bodyQuat[3]);
  scene.add(object);
  entities.push({ body, object });

  return { body, yawOffset };
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
  scene.add(new THREE.HemisphereLight(0xdaf4ff, 0x564b8a, 2.));

  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(18, 24, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 95;
  sun.shadow.camera.left = -48;
  sun.shadow.camera.right = 48;
  sun.shadow.camera.top = 48;
  sun.shadow.camera.bottom = -48;
  scene.add(sun);
}

function addSky(scene: THREE.Scene) {
  scene.background = new THREE.Color(0x60cfff);
  scene.fog = new THREE.Fog(0x60cfff, 72, 140);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(48, 0.16, 8, 160),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 }),
  );
  rim.position.set(0, 9, 0);
  rim.rotation.x = Math.PI / 2;
  scene.add(rim);
}
