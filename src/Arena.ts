import {
  box,
  ConstraintSpace,
  convexHull,
  hingeConstraint,
  MotionType,
  MotorState,
  rigidBody,
  type Listener,
  type World,
} from "crashcat";
import type { Quat, Vec3 } from "mathcat";
import { quat } from "mathcat";
import * as THREE from "three";
import { ShadowMapViewer } from "three/addons/utils/ShadowMapViewer.js";
import { platformerAsset } from "./assets";
import {
  addConveyorSegment,
  animateConveyorTextures,
  CONVEYOR_HALF_X,
  createConveyorListener,
  loadConveyorModel,
} from "./Conveyor";
import { buildInstancedMesh, loadGltfMesh, loadGltfScene, type GltfMesh, type TileTransform } from "./util/kaykit";
import type { PhysicsEntity, PhysicsLayers } from "./physics";
import { addSky } from "./Sky";

type ModelTransform = TileTransform & {
  rx?: number;
  rz?: number;
  scale?: number;
};

type BarrierPlacement = TileTransform & {
  height: number;
};

type SunShadowDebug = {
  shadowMapViewer: ShadowMapViewer;
};

const PLATFORM_HEIGHT = 4;
const PLATFORM_HALF_EXTENT = 3;
const BARRIER_HALF_THICKNESS = 0.5;
const FLOOR_TOP = 0;
const SECOND_STORY_TOP = 4;
const BASE_XS = [-18, -12, -6, 0, 6, 12, 18];
const RED_BASE_ZS = [24, 30, 36, 42];
const BLUE_BASE_ZS = [-24, -30, -36, -42];
const CORRIDOR_ZS = [-18, -12, -6, 0, 6, 12, 18];
const RIGHT_BELT_X = PLATFORM_HALF_EXTENT + CONVEYOR_HALF_X;
const LEFT_BELT_X = -RIGHT_BELT_X;
const OUTER_CORRIDOR_X = RIGHT_BELT_X + CONVEYOR_HALF_X + PLATFORM_HALF_EXTENT;
const CORRIDOR_XS = [-OUTER_CORRIDOR_X, 0, OUTER_CORRIDOR_X];
const CORRIDOR_WALL_X = OUTER_CORRIDOR_X + PLATFORM_HALF_EXTENT + BARRIER_HALF_THICKNESS;
const Y_AXIS: Vec3 = [0, 1, 0];
const SWIPER_HALF_EXTENTS: Vec3 = [4.5, 0.75, 0.5];
const SWIPER_CENTER_Y = FLOOR_TOP + SWIPER_HALF_EXTENTS[1];
const SWIPER_ANGULAR_SPEED = 2.6;
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
  private blueConveyorLong!: THREE.Group;
  private redConveyorLong!: THREE.Group;
  private blueRamp!: THREE.Group;
  private redRamp!: THREE.Group;
  private blueSwiperDoubleLong!: THREE.Group;
  private redSwiperDoubleLong!: THREE.Group;
  private conveyorTextures: THREE.Texture[] = [];
  private sunShadowDebug!: SunShadowDebug;

  private constructor(
    private readonly world: World,
    private readonly layers: PhysicsLayers,
    private readonly scene: THREE.Scene,
  ) {}

  static async create(world: World, layers: PhysicsLayers, scene: THREE.Scene): Promise<Arena> {
    const arena = new Arena(world, layers, scene);

    const sun = addLighting(scene);
    arena.sunShadowDebug = createSunShadowDebug(sun);
    addSky(scene, sun);

    await arena.loadAssets();
    arena.buildFloorPlan();
    arena.buildConveyors();
    arena.buildBoundaryWalls();
    arena.buildRaisedDecks();
    arena.buildSwipers();

    return arena;
  }

  update(time: number, _dt: number) {
    animateConveyorTextures(this.conveyorTextures, time);
  }

  updateSunShadowDebug(visible: boolean) {
    this.sunShadowDebug.shadowMapViewer.enabled = visible;
    if (visible) {
      layoutSunShadowMapViewer(this.sunShadowDebug.shadowMapViewer);
    }
  }

  renderSunShadowDebug(renderer: THREE.WebGLRenderer) {
    if (this.sunShadowDebug.shadowMapViewer.enabled) {
      this.sunShadowDebug.shadowMapViewer.render(renderer);
    }
  }

  resizeSunShadowDebug() {
    const wasEnabled = this.sunShadowDebug.shadowMapViewer.enabled;
    this.sunShadowDebug.shadowMapViewer.enabled = true;
    layoutSunShadowMapViewer(this.sunShadowDebug.shadowMapViewer);
    this.sunShadowDebug.shadowMapViewer.enabled = wasEnabled;
  }

  private async loadAssets() {
    const [
      platform6x6x4Blue,
      platform6x6x4Red,
      barrierTallBlue,
      barrierTallRed,
      conveyorLongBlue,
      conveyorLongRed,
      rampBlue,
      rampRed,
      swiperBlue,
      swiperRed,
    ] = await Promise.all([
      loadGltfMesh(platformerAsset("blue", "platform_6x6x4")),
      loadGltfMesh(platformerAsset("red", "platform_6x6x4")),
      loadGltfMesh(platformerAsset("blue", "barrier_4x1x4")),
      loadGltfMesh(platformerAsset("red", "barrier_4x1x4")),
      loadConveyorModel(platformerAsset("blue", "conveyor_4x8x1")),
      loadConveyorModel(platformerAsset("red", "conveyor_4x8x1")),
      loadModel(platformerAsset("blue", "platform_slope_4x6x4")),
      loadModel(platformerAsset("red", "platform_slope_4x6x4")),
      loadModel(platformerAsset("blue", "swiper_double_long")),
      loadModel(platformerAsset("red", "swiper_double_long")),
    ]);

    this.bluePlatform6x6x4 = platform6x6x4Blue;
    this.redPlatform6x6x4 = platform6x6x4Red;
    this.blueBarrierTall = barrierTallBlue;
    this.redBarrierTall = barrierTallRed;
    this.blueConveyorLong = conveyorLongBlue.model;
    this.redConveyorLong = conveyorLongRed.model;
    this.blueRamp = rampBlue;
    this.redRamp = rampRed;
    this.blueSwiperDoubleLong = swiperBlue;
    this.redSwiperDoubleLong = swiperRed;
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

    addTiles(this.scene, this.redPlatform6x6x4, redDeckTiles);
    addTiles(this.scene, this.bluePlatform6x6x4, blueDeckTiles);
  }

  private buildSwipers() {
    addSwiper(
      this.world,
      this.layers,
      this.scene,
      this.entities,
      this.redSwiperDoubleLong,
      -9,
      -36,
      SWIPER_ANGULAR_SPEED,
    );
    addSwiper(
      this.world,
      this.layers,
      this.scene,
      this.entities,
      this.blueSwiperDoubleLong,
      9,
      36,
      -SWIPER_ANGULAR_SPEED,
    );
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

function addSwiper(
  world: World,
  layers: PhysicsLayers,
  scene: THREE.Scene,
  entities: PhysicsEntity[],
  model: THREE.Group,
  x: number,
  z: number,
  targetAngularVelocity: number,
) {
  const object = new THREE.Group();
  const visual = model.clone(true);
  visual.position.y = -SWIPER_HALF_EXTENTS[1];
  object.add(visual);
  object.position.set(x, SWIPER_CENTER_Y, z);
  scene.add(object);

  const body = rigidBody.create(world, {
    shape: box.create({ halfExtents: SWIPER_HALF_EXTENTS, convexRadius: 0.05 }),
    motionType: MotionType.DYNAMIC,
    objectLayer: layers.kinematic,
    position: [x, SWIPER_CENTER_Y, z],
    friction: 0.85,
    restitution: 0.25,
    gravityFactor: 0,
    angularDamping: 0,
    allowSleeping: false,
    mass: 25,
    maxAngularVelocity: 12,
  });
  entities.push({ body, object });

  const anchor = rigidBody.create(world, {
    shape: box.create({ halfExtents: [0.1, 0.1, 0.1] }),
    motionType: MotionType.STATIC,
    objectLayer: layers.heldProp,
    position: [x, SWIPER_CENTER_Y, z],
  });

  const hinge = hingeConstraint.create(world, {
    bodyIdA: anchor.id,
    bodyIdB: body.id,
    pointA: [x, SWIPER_CENTER_Y, z],
    pointB: [x, SWIPER_CENTER_Y, z],
    hingeAxisA: [0, 1, 0],
    hingeAxisB: [0, 1, 0],
    normalAxisA: [1, 0, 0],
    normalAxisB: [1, 0, 0],
    space: ConstraintSpace.WORLD,
  });
  hingeConstraint.setMotorState(hinge, MotorState.VELOCITY);
  hingeConstraint.setTargetAngularVelocity(hinge, targetAngularVelocity);
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

  const sun = new THREE.DirectionalLight(0xffffcc, 1.5);
  sun.name = "Sun shadow";
  sun.position.set(24, 32, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(4096);
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.03;

  scene.add(sun);
  return sun;
}

function createSunShadowDebug(sun: THREE.DirectionalLight): SunShadowDebug {
  const shadowMapViewer = new ShadowMapViewer(sun);
  shadowMapViewer.enabled = false;
  layoutSunShadowMapViewer(shadowMapViewer);

  return { shadowMapViewer };
}

function layoutSunShadowMapViewer(viewer: ShadowMapViewer) {
  const size = Math.min(260, Math.max(160, Math.floor(window.innerWidth * 0.22)));
  viewer.size.set(size, size);
  viewer.position.set(window.innerWidth - size - 14, 14);
  viewer.update();
}
