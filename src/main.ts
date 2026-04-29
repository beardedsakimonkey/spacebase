import { updateWorld } from "crashcat";
import * as THREE from "three";
import "./styles.css";
import { Arena } from "./Arena";
import { BallController } from "./Ball";
import { Camera } from "./Camera";
import { DevHud } from "./hud";
import { InputController } from "./input";
import { PlayerController } from "./Player";
import { createPhysicsContext, syncPhysicsEntities } from "./physics";

const PHYSICS_DT = 1 / 60;
const THROW_CHARGE_SECONDS = 1.8;

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

(async () => {
  const scene = new THREE.Scene();
  const physics = createPhysicsContext();
  const camera = new Camera(
    window.innerWidth / window.innerHeight,
    physics.world,
    physics.layers,
  );
  const input = new InputController(renderer.domElement);
  const arena = await Arena.create(physics.world, physics.layers, scene);
  const player = new PlayerController(physics.world, physics.layers, scene);
  const ball = new BallController(physics.world, physics.layers, scene);
  const debugSettings = {
    sunShadow: false,
  };
  const playerRenderPosition = new THREE.Vector3();

  const hud = new DevHud({
    debugState: debugSettings,
    onSunShadowDebugChange: (enabled) => {
      debugSettings.sunShadow = enabled;
    },
  });

  window.addEventListener("resize", () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.resize(window.innerWidth / window.innerHeight);
    arena.resizeSunShadowDebug();
  });

  let lastTime = performance.now();
  let accumulator = 0;
  let elapsed = 0;
  let smoothedFps = 60;
  let lastPhysicsMs = 0;
  let pendingDrop = false;
  let pendingThrowPress = false;
  let pendingThrowRelease = false;
  let pendingChargedThrow = false;
  let pendingDash = false;
  let pendingReset = false;
  let pendingDebugToggle = false;
  const throwDirection = new THREE.Vector3();
  const throwVelocity = new THREE.Vector3();
  const throwVelocityVec: [number, number, number] = [0, 0, 0];
  let throwCharging = false;
  let throwChargePower = 0;
  let throwWindupTimer = 0;
  const pendingThrowParams = { direction: new THREE.Vector3(), power: 0, active: false };
  const THROW_WINDUP_SECONDS = 0.2;

  function animationFrame(now: number) {
    requestAnimationFrame(animationFrame);

    const frameTime = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    accumulator += frameTime;
    smoothedFps = THREE.MathUtils.lerp(smoothedFps, 1 / Math.max(frameTime, 0.0001), 0.08);

    const lookDelta = input.consumeLookDelta();
    camera.applyLookDelta(lookDelta.yaw, lookDelta.pitch);

    pendingDrop ||= input.consumeInteractPressed();
    pendingThrowPress ||= input.consumeThrowPressed();
    pendingThrowRelease ||= input.consumeThrowReleased();
    pendingReset ||= input.consumeResetPressed();
    pendingDebugToggle ||= input.consumeDebugPressed();

    if (pendingDebugToggle) {
      debugSettings.sunShadow = !debugSettings.sunShadow;
      pendingDebugToggle = false;
    }

    const movement = input.movement;
    const forwardAmount = Number(movement.forward) - Number(movement.backward);
    const rightAmount = Number(movement.right) - Number(movement.left);
    const moveDirection = camera.getMoveDirection(forwardAmount, rightAmount);

    if (pendingDrop && throwCharging) {
      throwCharging = false;
      pendingChargedThrow = false;
    }

    if (pendingThrowPress) {
      if (ball.isHeld()) {
        throwCharging = true;
        throwChargePower = 0;
      } else {
        pendingDash = true;
      }
      pendingThrowPress = false;
    }

    if (throwCharging) {
      throwChargePower = Math.min(1, throwChargePower + frameTime / THROW_CHARGE_SECONDS);
      camera.getPointerRayDirection(input.getPointerPosition(), renderer.domElement, throwDirection);
      ball.computeThrowVelocity(throwVelocityVec, player, throwDirection, throwChargePower);
      throwVelocity.set(throwVelocityVec[0], throwVelocityVec[1], throwVelocityVec[2]);

      // Reaching full charge auto-throws even if the mouse button stays held.
      if (throwChargePower >= 1) {
        pendingChargedThrow = true;
      }
    }

    if (pendingThrowRelease) {
      if (throwCharging) {
        pendingChargedThrow = true;
      }
      pendingThrowRelease = false;
    }

    while (accumulator >= PHYSICS_DT) {
      if (pendingReset) {
        player.reset(physics.world);
        pendingReset = false;
      }

      arena.update(elapsed, PHYSICS_DT);
      player.update(physics.world, movement, moveDirection, camera.camera.position, PHYSICS_DT);

      if (pendingDrop) {
        ball.drop(physics.world);
        pendingDrop = false;
      }
      ball.update(physics.world, player, PHYSICS_DT);

      if (pendingDash) {
        player.dash(physics.world);
        pendingDash = false;
      }

      if (pendingChargedThrow) {
        player.startThrowAnimation(throwDirection);
        pendingThrowParams.direction.copy(throwDirection);
        pendingThrowParams.power = throwChargePower;
        pendingThrowParams.active = true;
        throwWindupTimer = THROW_WINDUP_SECONDS;
        throwCharging = false;
        throwChargePower = 0;
        pendingChargedThrow = false;
      }

      if (pendingThrowParams.active) {
        throwWindupTimer -= PHYSICS_DT;
        if (throwWindupTimer <= 0) {
          ball.throw(physics.world, player, pendingThrowParams.direction, pendingThrowParams.power);
          pendingThrowParams.active = false;
        }
      }

      const physicsStart = performance.now();
      updateWorld(physics.world, arena.listener, PHYSICS_DT);
      lastPhysicsMs = performance.now() - physicsStart;

      syncPhysicsEntities(arena.entities);
      player.syncVisual();
      ball.syncVisual();

      elapsed += PHYSICS_DT;
      accumulator -= PHYSICS_DT;
    }

    camera.update(frameTime, player.getPosition(playerRenderPosition));
    arena.updateSunShadowDebug(debugSettings.sunShadow);
    hud.setDebugState(debugSettings);
    hud.update({
      fps: smoothedFps,
      physicsMs: lastPhysicsMs,
      player: player.getTelemetry(),
      ball: ball.getTelemetry(player),
    });

    renderer.render(scene, camera.camera);
    arena.renderSunShadowDebug(renderer);
  }

  requestAnimationFrame(animationFrame);
})();
