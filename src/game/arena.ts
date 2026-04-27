import { box, MotionType, rigidBody, sphere, type RigidBody, type World } from "crashcat";
import type { Vec3 } from "mathcat";
import { quat } from "mathcat";
import * as THREE from "three";
import { buildInstancedMesh, loadGltfMesh, loadGltfScene, type GltfMesh, type TileTransform } from "./kaykit";
import type { PhysicsEntity, PhysicsLayers } from "./physics";

export type Arena = {
  entities: PhysicsEntity[];
  update(time: number, dt: number): void;
};

// ─── constants ───────────────────────────────────────────────────────────────

const FLOOR_Y = -0.25;        // physics center y for ground-level floors
const FLOOR_TILE_Y = -0.5;    // visual tile y so top sits flush at y=0

const sweeperCenter: Vec3 = [0, 1.15, 10];
const tmpQuat = quat.create();

// ─── createArena ─────────────────────────────────────────────────────────────

export async function createArena(world: World, layers: PhysicsLayers, scene: THREE.Scene): Promise<Arena> {
  const entities: PhysicsEntity[] = [];

  addLighting(scene);
  addSky(scene);

  const [
    floor4x4, floor2x2, floor2x6, floor1x1,
    platform1x1, barrier4x1x2, barrier2x1x1,
    pillar2x2x4, pillar2x2x8, pillar1x1x4,
    springMesh, cone,
  ] = await Promise.all([
    loadGltfMesh("/assets/kaykit/floor_wood_4x4.gltf"),
    loadGltfMesh("/assets/kaykit/floor_wood_2x2.gltf"),
    loadGltfMesh("/assets/kaykit/floor_wood_2x6.gltf"),
    loadGltfMesh("/assets/kaykit/floor_wood_1x1.gltf"),
    loadGltfMesh("/assets/kaykit/platform_wood_1x1x1.gltf"),
    loadGltfMesh("/assets/kaykit/barrier_4x1x2.gltf"),
    loadGltfMesh("/assets/kaykit/barrier_2x1x1.gltf"),
    loadGltfMesh("/assets/kaykit/pillar_2x2x4.gltf"),
    loadGltfMesh("/assets/kaykit/pillar_2x2x8.gltf"),
    loadGltfMesh("/assets/kaykit/pillar_1x1x4.gltf"),
    loadGltfMesh("/assets/kaykit/spring.gltf"),
    loadGltfMesh("/assets/kaykit/cone.gltf"),
  ]);

  // Blue / coloured assets loaded as scenes (placed individually)
  const [archScene, archWideScene, railingStraightScene, railingCornerScene, hoopScene] = await Promise.all([
    loadGltfScene("/assets/kaykit/arch_blue.gltf"),
    loadGltfScene("/assets/kaykit/arch_wide_blue.gltf"),
    loadGltfScene("/assets/kaykit/railing_straight_single_blue.gltf"),
    loadGltfScene("/assets/kaykit/railing_corner_single_blue.gltf"),
    loadGltfScene("/assets/kaykit/hoop_blue.gltf"),
  ]);

  // Signage loaded as scenes
  const [arrowScene, finishScene] = await Promise.all([
    loadGltfScene("/assets/kaykit/signage_arrows_right.gltf"),
    loadGltfScene("/assets/kaykit/signage_finish_wide.gltf"),
  ]);

  // ── walls ──────────────────────────────────────────────────────────────────
  buildWalls(world, layers, scene, barrier4x1x2);

  // ── Zone A: start platform (z -18 → 0) ────────────────────────────────────
  buildStartZone(world, layers, scene,
    { floor4x4, floor2x2, pillar2x2x8, cone, arrowScene });

  // ── Zone B: three bridges (z 0 → 18) ──────────────────────────────────────
  const { leftBarrier, rightBarrier } =
    buildBridgeZone(world, layers, scene, entities,
      { floor2x6, floor2x2, barrier2x1x1, pillar2x2x4, railingStraightScene, railingCornerScene, archScene });

  // ── Zone C: spinner platform (z 18 → 26) ──────────────────────────────────
  const sweeper = buildSpinnerZone(world, layers, scene, entities,
    { floor4x4, floor2x2, pillar1x1x4, archWideScene, hoopScene });

  // ── Zone D: stepping stones + springs (z 26 → 34) ─────────────────────────
  buildStoneZone(world, layers, scene,
    { platform1x1, floor1x1, springMesh, pillar2x2x4, archScene });

  // ── Zone E: finish platform (z 34 → 36) ────────────────────────────────────
  buildFinishZone(world, layers, scene,
    { floor2x2, finishScene });

  return {
    entities,
    update(time: number, dt: number) {
      // Oscillating bridge barriers
      const lx = Math.sin(time * 1.1) * 3.5;
      rigidBody.moveKinematic(leftBarrier, [-8 + lx, 0.85, 9], tmpQuat, dt);

      const rx = Math.sin(time * 1.1 + Math.PI) * 3.5;
      rigidBody.moveKinematic(rightBarrier, [8 + rx, 0.85, 9], tmpQuat, dt);

      // Spinner
      quat.setAxisAngle(tmpQuat, [0, 1, 0], time * 1.45);
      rigidBody.moveKinematic(sweeper.body, sweeperCenter, tmpQuat, dt);
      sweeper.hub.rotation.y = time * 1.45;
    },
  };
}

// ─── Zone builders ───────────────────────────────────────────────────────────

function buildStartZone(
  world: World, layers: PhysicsLayers, scene: THREE.Scene,
  meshes: { floor4x4: GltfMesh; floor2x2: GltfMesh; pillar2x2x8: GltfMesh; cone: GltfMesh; arrowScene: THREE.Group },
) {
  // Physics: one wide slab
  staticBox(world, layers.terrain, [13, 0.25, 9], [0, FLOOR_Y, -9]);

  // Visual floor: 7 cols × 5 rows of 4×4 tiles (covers -14 to 14 in x, -18 to 2 in z)
  const floorTiles: TileTransform[] = [];
  for (let xi = 0; xi < 7; xi++) {
    for (let zi = 0; zi < 5; zi++) {
      floorTiles.push({ x: -12 + xi * 4, y: FLOOR_TILE_Y, z: -16 + zi * 4 });
    }
  }
  scene.add(buildInstancedMesh(meshes.floor4x4, floorTiles));

  // Tall decorative pillars flanking the arena entrance
  const pillarTiles: TileTransform[] = [
    { x: -11, y: 0, z: -16 }, { x: 11, y: 0, z: -16 },
    { x: -11, y: 0, z: -10 }, { x: 11, y: 0, z: -10 },
    { x: -11, y: 0, z: -4 },  { x: 11, y: 0, z: -4 },
  ];
  scene.add(buildInstancedMesh(meshes.pillar2x2x8, pillarTiles));

  // Cone decorations scattered on the start floor
  const coneTiles: TileTransform[] = [
    { x: -6, y: 0, z: -14 }, { x: 6, y: 0, z: -14 },
    { x: -3, y: 0, z: -11 }, { x: 3, y: 0, z: -11 },
    { x: -8, y: 0, z: -8 },  { x: 8, y: 0, z: -8 },
    { x: 0,  y: 0, z: -6 },
    { x: -5, y: 0, z: -5 },  { x: 5, y: 0, z: -5 },
  ];
  scene.add(buildInstancedMesh(meshes.cone, coneTiles));

  // Direction signage pointing toward the bridges
  const arrow = meshes.arrowScene.clone();
  arrow.position.set(0, 0, -3);
  arrow.rotation.y = Math.PI; // face +z
  setShadows(arrow);
  scene.add(arrow);
}

function buildBridgeZone(
  world: World, layers: PhysicsLayers, scene: THREE.Scene, entities: PhysicsEntity[],
  meshes: {
    floor2x6: GltfMesh; floor2x2: GltfMesh; barrier2x1x1: GltfMesh;
    pillar2x2x4: GltfMesh; railingStraightScene: THREE.Group; railingCornerScene: THREE.Group; archScene: THREE.Group;
  },
): { leftBarrier: RigidBody; rightBarrier: RigidBody } {
  // Three narrow bridges: left (x=-10 to -6), center (x=-2 to 2), right (x=6 to 10)
  // Each bridge is 4 units wide, 18 units long (z=0 to 18), at y=0

  const bridges = [
    { cx: -8, physHalfX: 2 },
    { cx: 0,  physHalfX: 2 },
    { cx: 8,  physHalfX: 2 },
  ];

  for (const { cx, physHalfX } of bridges) {
    staticBox(world, layers.terrain, [physHalfX, 0.25, 9], [cx, FLOOR_Y, 9]);

    // 2 wide (floor_wood_2x6 is 6 deep × 2 wide; lay 1 column × 3 rows rotated to align z)
    const tilePairs: TileTransform[] = [
      { x: cx, y: FLOOR_TILE_Y, z: 3,  ry: Math.PI / 2 },
      { x: cx, y: FLOOR_TILE_Y, z: 9,  ry: Math.PI / 2 },
      { x: cx, y: FLOOR_TILE_Y, z: 15, ry: Math.PI / 2 },
    ];
    scene.add(buildInstancedMesh(meshes.floor2x6, tilePairs));
  }

  // Pillar columns framing the bridge entry (z=0)
  const entryPillarTiles: TileTransform[] = [
    { x: -11, y: 0, z: 0 }, { x: -5, y: 0, z: 0 },
    { x: -3, y: 0, z: 0 },  { x: 3, y: 0, z: 0 },
    { x: 5, y: 0, z: 0 },   { x: 11, y: 0, z: 0 },
  ];
  scene.add(buildInstancedMesh(meshes.pillar2x2x4, entryPillarTiles));

  // Arch gateways: one at bridge entry (z=0), one at exit (z=18)
  for (const [z, ry] of [[0, 0], [18, 0]] as const) {
    for (const cx of [-8, 0, 8]) {
      const arch = meshes.archScene.clone();
      arch.position.set(cx, 0, z);
      arch.rotation.y = ry;
      setShadows(arch);
      scene.add(arch);
    }
  }

  // Railings along outer left and right bridge edges
  for (const z of [2, 6, 10, 14]) {
    for (const [cx, side] of [[-8, -1], [8, 1]] as [number, number][]) {
      const rail = meshes.railingStraightScene.clone();
      rail.position.set(cx + side * 2.8, 0, z);
      rail.rotation.y = Math.PI / 2;
      setShadows(rail);
      scene.add(rail);
    }
  }

  // ── Oscillating kinematic barriers on the outer bridges ──
  // Left bridge barrier
  const leftBarrier = rigidBody.create(world, {
    shape: box.create({ halfExtents: [0.5, 0.7, 2] }),
    motionType: MotionType.KINEMATIC,
    objectLayer: layers.kinematic,
    position: [-8, 0.85, 9],
    restitution: 0.4,
  });
  const leftBarrierGroup = new THREE.Group();
  leftBarrierGroup.add(buildInstancedMesh(meshes.barrier2x1x1, [{ x: 0, y: -0.7, z: 0, ry: Math.PI / 2 }]));
  scene.add(leftBarrierGroup);
  entities.push({ body: leftBarrier, object: leftBarrierGroup });

  // Right bridge barrier
  const rightBarrier = rigidBody.create(world, {
    shape: box.create({ halfExtents: [0.5, 0.7, 2] }),
    motionType: MotionType.KINEMATIC,
    objectLayer: layers.kinematic,
    position: [8, 0.85, 9],
    restitution: 0.4,
  });
  const rightBarrierGroup = new THREE.Group();
  rightBarrierGroup.add(buildInstancedMesh(meshes.barrier2x1x1, [{ x: 0, y: -0.7, z: 0, ry: Math.PI / 2 }]));
  scene.add(rightBarrierGroup);
  entities.push({ body: rightBarrier, object: rightBarrierGroup });

  return { leftBarrier, rightBarrier };
}

function buildSpinnerZone(
  world: World, layers: PhysicsLayers, scene: THREE.Scene, entities: PhysicsEntity[],
  meshes: { floor4x4: GltfMesh; floor2x2: GltfMesh; pillar1x1x4: GltfMesh; archWideScene: THREE.Group; hoopScene: THREE.Group },
): { body: RigidBody; hub: THREE.Mesh } {
  // Wide reconnecting platform z=18 to 26
  staticBox(world, layers.terrain, [13, 0.25, 4], [0, FLOOR_Y, 22]);

  const floorTiles: TileTransform[] = [];
  for (let xi = 0; xi < 7; xi++) {
    for (let zi = 0; zi < 2; zi++) {
      floorTiles.push({ x: -12 + xi * 4, y: FLOOR_TILE_Y, z: 19 + zi * 4 });
    }
  }
  scene.add(buildInstancedMesh(meshes.floor4x4, floorTiles));

  // Wide arches framing the spinner area
  for (const z of [18, 26]) {
    const arch = meshes.archWideScene.clone();
    arch.position.set(0, 0, z);
    setShadows(arch);
    scene.add(arch);
  }

  // Decorative hoops above the spinner (raised, visual only)
  for (const [x, z] of [[-5, 21], [5, 21]] as const) {
    const hoop = meshes.hoopScene.clone();
    hoop.position.set(x, 1.8, z);
    hoop.rotation.y = Math.PI / 2;
    setShadows(hoop);
    scene.add(hoop);
  }

  // Corner pillars
  const pillarTiles: TileTransform[] = [
    { x: -12, y: 0, z: 18 }, { x: 12, y: 0, z: 18 },
    { x: -12, y: 0, z: 26 }, { x: 12, y: 0, z: 26 },
  ];
  scene.add(buildInstancedMesh(meshes.pillar1x1x4, pillarTiles));

  // Sweeper arm (kept as coloured Three.js mesh — user said don't rebuild it)
  const sweeperBody = rigidBody.create(world, {
    shape: box.create({ halfExtents: [6.6, 0.18, 0.38] }),
    motionType: MotionType.KINEMATIC,
    objectLayer: layers.kinematic,
    position: sweeperCenter,
    friction: 0.6,
    restitution: 0.6,
  });
  const sweeperMesh = new THREE.Mesh(
    new THREE.BoxGeometry(13.2, 0.36, 0.76),
    new THREE.MeshStandardMaterial({ color: 0xff4fd8, roughness: 0.46 }),
  );
  sweeperMesh.castShadow = true;
  sweeperMesh.receiveShadow = true;
  scene.add(sweeperMesh);
  entities.push({ body: sweeperBody, object: sweeperMesh });

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 1.2, 24),
    new THREE.MeshStandardMaterial({ color: 0x7348ff, roughness: 0.45 }),
  );
  hub.position.set(sweeperCenter[0], sweeperCenter[1], sweeperCenter[2]);
  hub.castShadow = true;
  hub.receiveShadow = true;
  scene.add(hub);

  return { body: sweeperBody, hub };
}

function buildStoneZone(
  world: World, layers: PhysicsLayers, scene: THREE.Scene,
  meshes: { platform1x1: GltfMesh; floor1x1: GltfMesh; springMesh: GltfMesh; pillar2x2x4: GltfMesh; archScene: THREE.Group },
) {
  // Scattered stepping stones at varying heights. Each is a 2×2 physics box + platform tiles.
  const stones: Array<{ x: number; y: number; z: number }> = [
    // Row 1
    { x: -8, y: 0,   z: 27 }, { x: -3, y: 1,   z: 27 }, { x: 3,  y: 0,   z: 27 }, { x: 8,  y: 1,   z: 27 },
    // Row 2
    { x: -9, y: 1.5, z: 29 }, { x: -4, y: 0,   z: 30 }, { x: 2,  y: 1.5, z: 29 }, { x: 7,  y: 0,   z: 30 },
    // Row 3
    { x: -6, y: 0,   z: 32 }, { x: 0,  y: 2,   z: 31 }, { x: 6,  y: 0,   z: 32 },
    // Row 4 (near finish)
    { x: -9, y: 0.5, z: 33 }, { x: -2, y: 1,   z: 33 }, { x: 4,  y: 0.5, z: 33 }, { x: 10, y: 0,   z: 33 },
  ];

  const platformTiles: TileTransform[] = [];
  for (const { x, y, z } of stones) {
    // Physics box: halfExtents 1×0.25×1, top surface at y+0.25... but stone y is the floor surface,
    // so center y = stone.y - 0.25
    staticBox(world, layers.terrain, [1, 0.25, 1], [x, y - 0.25, z]);
    platformTiles.push({ x, y: y - 0.5, z }); // platform model bottom at stone.y - 0.5
  }
  scene.add(buildInstancedMesh(meshes.platform1x1, platformTiles));

  // Spring pads — 4 springs on lower stones that bounce the player up
  const springStonePads: Array<{ x: number; z: number }> = [
    { x: -8, z: 27 }, { x: 8, z: 27 }, { x: -4, z: 30 }, { x: 7, z: 30 },
  ];
  const springTiles: TileTransform[] = [];
  for (const { x, z } of springStonePads) {
    // High-restitution trigger sits right at the stone surface
    rigidBody.create(world, {
      shape: sphere.create({ radius: 0.45 }),
      motionType: MotionType.STATIC,
      objectLayer: layers.terrain,
      position: [x, 1.2, z],  // a bit above stone surface (spring top is 2.2 units tall from y=-0.5)
      restitution: 2.2,
      friction: 0.1,
    });
    springTiles.push({ x, y: -0.5, z });
  }
  scene.add(buildInstancedMesh(meshes.springMesh, springTiles));

  // Arch at zone entry
  const entryArch = meshes.archScene.clone();
  entryArch.position.set(0, 0, 26);
  setShadows(entryArch);
  scene.add(entryArch);

  // Pillar pairs flanking the zone
  const pillarTiles: TileTransform[] = [
    { x: -12, y: 0, z: 27 }, { x: 12, y: 0, z: 27 },
    { x: -12, y: 0, z: 32 }, { x: 12, y: 0, z: 32 },
  ];
  scene.add(buildInstancedMesh(meshes.pillar2x2x4, pillarTiles));
}

function buildFinishZone(
  world: World, layers: PhysicsLayers, scene: THREE.Scene,
  meshes: { floor2x2: GltfMesh; finishScene: THREE.Group },
) {
  // Wide final platform z=34 to 36
  staticBox(world, layers.terrain, [13, 0.25, 1], [0, FLOOR_Y, 35]);

  const tiles: TileTransform[] = [];
  for (let xi = 0; xi < 13; xi++) {
    tiles.push({ x: -12 + xi * 2, y: FLOOR_TILE_Y, z: 35 });
  }
  scene.add(buildInstancedMesh(meshes.floor2x2, tiles));

  // Finish sign on the back wall
  const finish = meshes.finishScene.clone();
  finish.position.set(0, 1, 36);
  finish.rotation.y = Math.PI;
  setShadows(finish);
  scene.add(finish);
}

function buildWalls(world: World, layers: PhysicsLayers, scene: THREE.Scene, barrierMesh: GltfMesh) {
  const wallDefs: Array<{ halfExtents: Vec3; position: Vec3; along: "x" | "z" }> = [
    { halfExtents: [0.4, 1.1, 28], position: [-13.2, 0.8, 8], along: "z" },
    { halfExtents: [0.4, 1.1, 28], position: [13.2, 0.8, 8],  along: "z" },
    { halfExtents: [13.5, 1.1, 0.4], position: [0, 0.8, -20.2], along: "x" },
    { halfExtents: [13.5, 1.1, 0.4], position: [0, 0.8, 36.2],  along: "x" },
  ];

  for (const { halfExtents, position } of wallDefs) {
    rigidBody.create(world, {
      shape: box.create({ halfExtents }),
      motionType: MotionType.STATIC,
      objectLayer: layers.terrain,
      position,
      friction: 0.8,
      restitution: 0.25,
    });
  }

  const tiles: TileTransform[] = [];
  const rows = [-0.3, 0.7];
  const zCenters = Array.from({ length: 14 }, (_, i) => -18 + i * 4);
  const xCenters = [-12, -8, -4, 0, 4, 8, 12];

  for (const y of rows) {
    for (const z of zCenters) {
      tiles.push({ x: -13.2, y, z, ry: Math.PI / 2 });
      tiles.push({ x:  13.2, y, z, ry: Math.PI / 2 });
    }
    for (const x of xCenters) {
      tiles.push({ x, y, z: -20.2 });
      tiles.push({ x, y, z:  36.2 });
    }
  }
  scene.add(buildInstancedMesh(barrierMesh, tiles));
}

// ─── Lighting & sky ──────────────────────────────────────────────────────────

function addLighting(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xd8f5ff, 0x5b4a9c, 2.6));

  const sun = new THREE.DirectionalLight(0xffffff, 3.1);
  sun.position.set(10, 18, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 80;
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 34;
  sun.shadow.camera.bottom = -34;
  scene.add(sun);
}

function addSky(scene: THREE.Scene) {
  scene.background = new THREE.Color(0x54caff);
  scene.fog = new THREE.Fog(0x54caff, 38, 78);

  const horizon = new THREE.Mesh(
    new THREE.TorusGeometry(30, 0.12, 8, 120),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32 }),
  );
  horizon.position.set(0, 8, 10);
  horizon.rotation.x = Math.PI / 2;
  scene.add(horizon);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function staticBox(world: World, layer: number, halfExtents: Vec3, position: Vec3) {
  return rigidBody.create(world, {
    shape: box.create({ halfExtents }),
    motionType: MotionType.STATIC,
    objectLayer: layer,
    position,
    friction: 2,
    restitution: 0.02,
  });
}

function setShadows(obj: THREE.Object3D) {
  obj.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
}
