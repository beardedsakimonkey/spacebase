import { updateWorld } from "crashcat";
import * as THREE from "three";
import "./styles.css";
import { createArena } from "./game/arena";
import { BallController, createDefaultBallTuning } from "./game/ball";
import { FollowCamera } from "./game/camera";
import { DevHud, type RendererTuning, type ToneMappingMode } from "./game/hud";
import { InputController } from "./game/input";
import { PlayerController, createDefaultPlayerTuning } from "./game/player";
import { createDebugPhysicsObject, createPhysicsContext, syncPhysicsEntities } from "./game/physics";
import { ThrowChargeMeter, TrajectoryPreview } from "./game/throw-preview";

const PHYSICS_DT = 1 / 60;

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
renderer.domElement.tabIndex = 0;
app.append(renderer.domElement);
renderer.domElement.focus();

const toneMappingModes: Record<ToneMappingMode, THREE.ToneMapping> = {
  none: THREE.NoToneMapping,
  linear: THREE.LinearToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  cineon: THREE.CineonToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
};
const rendererTuning: RendererTuning = {
  toneMapping: "reinhard",
  exposure: 1.05,
};

function applyRendererTuning() {
  // Tone mapping is a full renderer mode, while exposure can be tuned continuously.
  renderer.toneMapping = toneMappingModes[rendererTuning.toneMapping];
  renderer.toneMappingExposure = rendererTuning.exposure;
}

applyRendererTuning();

(async () => {
  const scene = new THREE.Scene();
  const camera = new FollowCamera(window.innerWidth / window.innerHeight);
  const input = new InputController(renderer.domElement);
  const physics = createPhysicsContext();
  const arena = await createArena(physics.world, physics.layers, scene);
  const playerTuning = createDefaultPlayerTuning();
  const ballTuning = createDefaultBallTuning();
  const player = new PlayerController(physics.world, physics.layers, scene, playerTuning);
  const ball = new BallController(physics.world, physics.layers, scene, ballTuning);
  const debugPhysics = createDebugPhysicsObject(scene);
  const chargeMeter = new ThrowChargeMeter();
  const trajectoryPreview = new TrajectoryPreview(scene);
  const debugSettings = {
    physics: false,
    helpers: false,
  };
  const playerRenderPosition = new THREE.Vector3();

  const hud = new DevHud({
    player: playerTuning,
    ball: ballTuning,
    renderer: rendererTuning,
    debug: debugSettings,
    onToneMappingChange: applyRendererTuning,
    onBalanceModeChange: () => player.applyBalanceMode(physics.world),
    onResetPlayer: () => player.reset(physics.world),
    onResetBall: () => ball.reset(physics.world),
  });

  window.addEventListener("resize", () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.resize(window.innerWidth / window.innerHeight);
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
  const throwOrigin = new THREE.Vector3();
  const throwVelocity = new THREE.Vector3();
  const throwVelocityVec: [number, number, number] = [0, 0, 0];
  let throwCharging = false;
  let throwChargePower = 0;

  function animationFrame(now: number) {
    requestAnimationFrame(animationFrame);
    renderer.toneMappingExposure = rendererTuning.exposure;

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
      debugSettings.physics = !debugSettings.physics;
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
      throwChargePower = Math.min(1, throwChargePower + frameTime / ballTuning.throwChargeSeconds);
      camera.getPointerRayDirection(input.getPointerPosition(), renderer.domElement, throwDirection);
      ball.computeThrowVelocity(throwVelocityVec, player, throwDirection, throwChargePower);
      throwVelocity.set(throwVelocityVec[0], throwVelocityVec[1], throwVelocityVec[2]);
      trajectoryPreview.update(ball.getPosition(throwOrigin), throwVelocity, -9.81);
      chargeMeter.setPower(throwChargePower);

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

    chargeMeter.setVisible(throwCharging && !pendingChargedThrow);
    trajectoryPreview.setVisible(throwCharging && !pendingChargedThrow);

    while (accumulator >= PHYSICS_DT) {
      if (pendingReset) {
        player.reset(physics.world);
        pendingReset = false;
      }

      arena.update(elapsed, PHYSICS_DT);
      player.update(physics.world, movement, moveDirection, camera.camera.position, PHYSICS_DT);
      player.setDebugVisible(debugSettings.helpers);

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
        ball.throw(physics.world, player, throwDirection, throwChargePower);
        throwCharging = false;
        throwChargePower = 0;
        chargeMeter.setVisible(false);
        trajectoryPreview.setVisible(false);
        pendingChargedThrow = false;
      }

      const physicsStart = performance.now();
      updateWorld(physics.world, undefined, PHYSICS_DT);
      lastPhysicsMs = performance.now() - physicsStart;

      syncPhysicsEntities(arena.entities);
      player.syncVisual();
      ball.syncVisual();

      elapsed += PHYSICS_DT;
      accumulator -= PHYSICS_DT;
    }

    camera.update(frameTime, player.getPosition(playerRenderPosition));
    debugPhysics.update(physics.world, debugSettings.physics);
    hud.update({
      fps: smoothedFps,
      physicsMs: lastPhysicsMs,
      player: player.getTelemetry(),
      ball: ball.getTelemetry(player),
    });

    renderer.render(scene, camera.camera);
  }

  requestAnimationFrame(animationFrame);
})();
