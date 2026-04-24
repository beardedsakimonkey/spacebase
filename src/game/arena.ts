import { box, MotionType, rigidBody, sphere, triangleMesh, type World } from "crashcat";
import type { Vec3 } from "mathcat";
import { quat } from "mathcat";
import * as THREE from "three";
import type { PhysicsEntity, PhysicsLayers } from "./physics";

export type Arena = {
  entities: PhysicsEntity[];
  update(time: number, dt: number): void;
};

type BoxOptions = {
  halfExtents: Vec3;
  position: Vec3;
  color: number;
  material?: THREE.Material;
  world: World;
  layer: number;
  scene: THREE.Scene;
  entities: PhysicsEntity[];
  motionType?: MotionType;
  quaternion?: ReturnType<typeof quat.create>;
  friction?: number;
  restitution?: number;
  sync?: boolean;
};

const tmpQuat = quat.create();
const platformCenter: Vec3 = [9, 1.25, 12];
const sweeperCenter: Vec3 = [0, 1.15, 21];
const grassMaterial = createGrassMaterial();

export function createArena(world: World, layers: PhysicsLayers, scene: THREE.Scene): Arena {
  const entities: PhysicsEntity[] = [];

  addLighting(scene);
  addSky(scene);

  addBox({
    world,
    layer: layers.terrain,
    scene,
    entities,
    halfExtents: [26, 0.25, 28],
    position: [0, -0.25, 8],
    color: 0x36d6b6,
    material: grassMaterial,
    friction: 4,
    restitution: 0,
    sync: false,
  });

  addBox({
    world,
    layer: layers.terrain,
    scene,
    entities,
    halfExtents: [6, 0.35, 7],
    position: [0, 0.48, 3],
    quaternion: quat.setAxisAngle(quat.create(), [1, 0, 0], 0.085),
    color: 0xffdf46,
    friction: 2.4,
    restitution: 0.02,
    sync: false,
  });

  addBox({
    world,
    layer: layers.terrain,
    scene,
    entities,
    halfExtents: [5.5, 0.25, 3],
    position: [0, 0.22, -6],
    color: 0xff6a4d,
    friction: 3,
    restitution: 0.05,
    sync: false,
  });

  addWalls(world, layers, scene, entities);
  addBumpers(world, layers, scene, entities);
  addRollingTerrain(world, layers, scene, entities);
  addPushBalls(world, layers, scene, entities);

  const movingPlatform = addBox({
    world,
    layer: layers.kinematic,
    scene,
    entities,
    halfExtents: [3.2, 0.22, 2.8],
    position: platformCenter,
    color: 0x46c7ff,
    motionType: MotionType.KINEMATIC,
    friction: 2,
    restitution: 0.05,
  });

  const sweeper = addBox({
    world,
    layer: layers.kinematic,
    scene,
    entities,
    halfExtents: [6.6, 0.18, 0.38],
    position: sweeperCenter,
    color: 0xff4fd8,
    motionType: MotionType.KINEMATIC,
    friction: 0.6,
    restitution: 0.6,
  });

  const sweeperHub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 1.2, 24),
    new THREE.MeshStandardMaterial({ color: 0x7348ff, roughness: 0.45 }),
  );
  sweeperHub.position.set(sweeperCenter[0], sweeperCenter[1], sweeperCenter[2]);
  sweeperHub.castShadow = true;
  sweeperHub.receiveShadow = true;
  scene.add(sweeperHub);

  return {
    entities,
    update(time: number, dt: number) {
      const platformX = platformCenter[0] + Math.sin(time * 1.25) * 5.2;
      const platformTarget: Vec3 = [platformX, platformCenter[1], platformCenter[2]];
      rigidBody.moveKinematic(movingPlatform.body, platformTarget, movingPlatform.body.quaternion, dt);

      quat.setAxisAngle(tmpQuat, [0, 1, 0], time * 1.45);
      rigidBody.moveKinematic(sweeper.body, sweeperCenter, tmpQuat, dt);
      sweeperHub.rotation.y = time * 1.45;
    },
  };
}

function addLighting(scene: THREE.Scene) {
  const ambient = new THREE.HemisphereLight(0xd8f5ff, 0x5b4a9c, 2.6);
  scene.add(ambient);

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

function addWalls(world: World, layers: PhysicsLayers, scene: THREE.Scene, entities: PhysicsEntity[]) {
  const wallColor = 0x7348ff;
  const wallOptions = [
    { halfExtents: [0.4, 1.1, 28] as Vec3, position: [-13.2, 0.8, 8] as Vec3 },
    { halfExtents: [0.4, 1.1, 28] as Vec3, position: [13.2, 0.8, 8] as Vec3 },
    { halfExtents: [13.5, 1.1, 0.4] as Vec3, position: [0, 0.8, -20.2] as Vec3 },
    { halfExtents: [13.5, 1.1, 0.4] as Vec3, position: [0, 0.8, 36.2] as Vec3 },
  ];

  for (const options of wallOptions) {
    addBox({
      world,
      layer: layers.terrain,
      scene,
      entities,
      ...options,
      color: wallColor,
      friction: 0.8,
      restitution: 0.25,
      sync: false,
    });
  }
}

function addBumpers(world: World, layers: PhysicsLayers, scene: THREE.Scene, entities: PhysicsEntity[]) {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.38,
    emissive: 0xff4fd8,
    emissiveIntensity: 0.16,
  });
  const ringMaterial = new THREE.MeshStandardMaterial({ color: 0xff4fd8, roughness: 0.4 });

  for (const [x, z, radius] of [
    [-5.2, 13.2, 0.9],
    [4.6, 14.8, 0.8],
    [-2.4, 18.4, 0.7],
    [6.2, 24.6, 1],
  ] as const) {
    const body = rigidBody.create(world, {
      shape: sphere.create({ radius }),
      motionType: MotionType.STATIC,
      objectLayer: layers.terrain,
      position: [x, radius * 0.82, z],
      friction: 0.3,
      restitution: 0.92,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 14), material);
    mesh.position.set(x, radius * 0.82, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.92, 0.045, 8, 32), ringMaterial);
    ring.position.copy(mesh.position);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    entities.push({ body, object: mesh, sync: false });
  }
}

function addPushBalls(world: World, layers: PhysicsLayers, scene: THREE.Scene, entities: PhysicsEntity[]) {
  const material = new THREE.MeshStandardMaterial({
    color: 0x46c7ff,
    roughness: 0.36,
    metalness: 0.02,
    emissive: 0x146bff,
    emissiveIntensity: 0.05,
  });
  const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42 });

  for (const [x, z, radius, color] of [
    [-7.2, 4.4, 0.72, 0x46c7ff],
    [-4.2, 7.4, 0.62, 0xffdf46],
    [4.8, 7.0, 0.78, 0xff4fd8],
    [7.6, 2.6, 0.66, 0x34e0a1],
    [1.2, 11.6, 0.86, 0xff7a4d],
  ] as const) {
    const body = rigidBody.create(world, {
      shape: sphere.create({ radius }),
      motionType: MotionType.DYNAMIC,
      objectLayer: layers.props,
      position: [x, radius + 0.18, z],
      mass: radius * 1.35,
      friction: 0.75,
      restitution: 0.45,
      linearDamping: 0.025,
      angularDamping: 0.12,
    });
    const ballMaterial = material.clone();
    ballMaterial.color.setHex(color);
    ballMaterial.emissive.setHex(color);

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 28, 18), ballMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(x, radius + 0.18, z);

    const stripe = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.74, radius * 0.045, 8, 36), stripeMaterial);
    stripe.rotation.x = Math.PI / 2;
    mesh.add(stripe);

    scene.add(mesh);
    entities.push({ body, object: mesh });
  }
}

function addRollingTerrain(world: World, layers: PhysicsLayers, scene: THREE.Scene, entities: PhysicsEntity[]) {
  const grid = 18;
  const cell = 1.35;
  const originX = -8.5;
  const originZ = 23;
  const positions: number[] = [];

  for (let z = 0; z <= grid; z += 1) {
    for (let x = 0; x <= grid; x += 1) {
      const worldX = originX + (x - grid / 2) * cell;
      const worldZ = originZ + (z - grid / 2) * cell;
      const y = Math.sin(x * 0.72) * 0.38 + Math.cos(z * 0.58) * 0.32 - 0.08;
      positions.push(worldX, y, worldZ);
    }
  }

  const indices: number[] = [];
  const row = grid + 1;
  for (let z = 0; z < grid; z += 1) {
    for (let x = 0; x < grid; x += 1) {
      const bl = z * row + x;
      const br = bl + 1;
      const tl = bl + row;
      const tr = tl + 1;
      indices.push(bl, tl, br, br, tl, tr);
    }
  }

  const body = rigidBody.create(world, {
    shape: triangleMesh.create({ positions, indices }),
    motionType: MotionType.STATIC,
    objectLayer: layers.terrain,
    friction: 2.4,
    restitution: 0.05,
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    grassMaterial.clone(),
  );
  mesh.receiveShadow = true;
  scene.add(mesh);
  entities.push({ body, object: mesh, sync: false });
}

function addBox(options: BoxOptions): PhysicsEntity {
  const motionType = options.motionType ?? MotionType.STATIC;
  const body = rigidBody.create(options.world, {
    shape: box.create({ halfExtents: options.halfExtents }),
    motionType,
    objectLayer: options.layer,
    position: options.position,
    quaternion: options.quaternion,
    friction: options.friction ?? 1,
    restitution: options.restitution ?? 0.05,
  });

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(
      options.halfExtents[0] * 2,
      options.halfExtents[1] * 2,
      options.halfExtents[2] * 2,
    ),
    new THREE.MeshStandardMaterial({
      color: options.color,
      roughness: 0.46,
      metalness: 0.02,
    }),
  );
  if (options.material) {
    mesh.material = options.material;
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.set(options.position[0], options.position[1], options.position[2]);
  if (options.quaternion) {
    mesh.quaternion.set(options.quaternion[0], options.quaternion[1], options.quaternion[2], options.quaternion[3]);
  }
  options.scene.add(mesh);

  const entity = { body, object: mesh, sync: options.sync };
  options.entities.push(entity);
  return entity;
}

function createGrassMaterial() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) {
    return new THREE.MeshStandardMaterial({ color: 0x36d67f, roughness: 0.78 });
  }

  context.fillStyle = "#35cc77";
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < canvas.height; y += 32) {
    context.fillStyle = y % 64 === 0 ? "#46da83" : "#2fbd6d";
    context.fillRect(0, y, canvas.width, 32);
  }

  context.globalAlpha = 0.22;
  context.strokeStyle = "#e6ffe9";
  context.lineWidth = 2;
  for (let x = 0; x <= canvas.width; x += 64) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }

  context.globalAlpha = 0.18;
  for (let i = 0; i < 1200; i += 1) {
    const shade = Math.random() > 0.5 ? 255 : 20;
    context.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
    context.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 2);
  texture.colorSpace = THREE.SRGBColorSpace;

  return new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0,
  });
}
