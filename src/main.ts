import { updateWorld } from "crashcat";
import { debugRenderer } from "crashcat/three";
import * as THREE from "three";
import "./styles.css";
import { Arena } from "./Arena";
import { Camera } from "./Camera";
import { Gui } from "./gui";
import { InputController } from "./input";
import { PlayerController } from "./Player";
import { createPhysicsContext, syncPhysicsEntities } from "./physics";

const PHYSICS_DT = 1 / 60;
const PHYSICS_DEBUG_RENDER_ORDER = 1000;
const configuredDebugMaterials = new WeakSet<THREE.Material>();

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Missing #app root element.");
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.LinearToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.domElement.tabIndex = 0;
app.append(renderer.domElement);
renderer.domElement.focus();

function configurePhysicsDebugObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.LineSegments)) {
      return;
    }

    child.renderOrder = PHYSICS_DEBUG_RENDER_ORDER;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (configuredDebugMaterials.has(material)) {
        continue;
      }
      material.depthTest = false;
      material.depthWrite = false;
      material.needsUpdate = true;
      configuredDebugMaterials.add(material);
    }
  });
}

(async () => {
  const scene = new THREE.Scene();
  const physics = createPhysicsContext();
  const physicsDebugOptions = debugRenderer.createDefaultOptions();
  physicsDebugOptions.bodies.enabled = true;
  physicsDebugOptions.bodies.wireframe = true;
  physicsDebugOptions.bodies.color = debugRenderer.BodyColorMode.MOTION_TYPE;

  const physicsDebug = debugRenderer.init(physicsDebugOptions);
  physicsDebug.object3d.visible = false;
  scene.add(physicsDebug.object3d);

  const camera = new Camera(
    window.innerWidth / window.innerHeight,
    physics.world,
    physics.layers,
  );
  const input = new InputController(renderer.domElement);
  const arena = await Arena.create(physics.world, physics.layers, scene);
  const player = new PlayerController(physics.world, physics.layers, scene);
  const playerRenderPosition = new THREE.Vector3();

  const gui = new Gui();

  window.addEventListener("resize", () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.resize(window.innerWidth / window.innerHeight);
  });

  let lastTime = performance.now();
  let accumulator = 0;
  let elapsed = 0;
  let lastPhysicsMs = 0;
  let pendingDash = false;

  function animationFrame(now: number) {
    requestAnimationFrame(animationFrame);
    gui.beginFrame();

    const frameTime = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    accumulator += frameTime;

    const lookDelta = input.consumeLookDelta();
    camera.applyLookDelta(lookDelta.yaw, lookDelta.pitch);
    pendingDash ||= input.consumeDashPressed();

    const movement = input.movement;
    const forwardAmount = Number(movement.forward) - Number(movement.backward);
    const rightAmount = Number(movement.right) - Number(movement.left);
    const moveDirection = camera.getMoveDirection(forwardAmount, rightAmount);

    while (accumulator >= PHYSICS_DT) {
      arena.update(elapsed, PHYSICS_DT);
      player.update(physics.world, movement, moveDirection, PHYSICS_DT);

      if (pendingDash) {
        player.dash(physics.world);
        pendingDash = false;
      }

      const physicsStart = performance.now();
      updateWorld(physics.world, arena.listener, PHYSICS_DT);
      lastPhysicsMs = performance.now() - physicsStart;

      syncPhysicsEntities(arena.entities);
      player.syncVisual();

      elapsed += PHYSICS_DT;
      accumulator -= PHYSICS_DT;
    }

    camera.update(frameTime, player.getPosition(playerRenderPosition));
    physicsDebug.object3d.visible = gui.physicsDebugWireframes;
    if (gui.physicsDebugWireframes) {
      debugRenderer.update(physicsDebug, physics.world);
      configurePhysicsDebugObject(physicsDebug.object3d);
    }

    gui.update({
      physicsMs: lastPhysicsMs,
      player: player.getTelemetry(),
    });

    renderer.render(scene, camera.camera);
    gui.endFrame();
  }

  requestAnimationFrame(animationFrame);
})();
