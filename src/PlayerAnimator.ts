import * as THREE from "three";
import { characterAnimationAsset, characterMannequinAsset } from "./assets";
import { loadGltf } from "./util/kaykit";
import { remapMannequinBodyColor, type MannequinBodyColor } from "./util/mannequin";

type PlayerAnimationName =
  | "idle"
  | "run"
  | "jumpStart"
  | "jumpIdle"
  | "jumpLand"
  | "dash"
  | "wallHit"
  | "spawn";

export type PlayerAnimationFrameState = {
  hadGroundContact: boolean;
  hasGroundContact: boolean;
  wantsRunAnimation: boolean;
  horizontalSpeed: number;
};

const RUN_ANIMATION_BASE_SPEED = 8.2;
const ANIMATION_FADE_SECONDS = 0.12;
const JUMP_START_ANIMATION_SECONDS = 0.28;
const JUMP_START_ANIMATION_START_TIME = 0.18;
const LAND_ANIMATION_SECONDS = 0.24;
const DASH_ANIMATION_SECONDS = 0.40;
const WALL_HIT_ANIMATION_SECONDS = 0.5;
const WALL_HIT_ANIMATION_START_TIME = 0.18;
const SPAWN_ANIMATION_SECONDS = 1.3;
const PLAYER_MODEL_SCALE = 1.0;
const PLAYER_MODEL_OFFSET_Y = -1.1;
const PLAYER_BODY_COLOR: MannequinBodyColor = "yellow";

export class PlayerAnimator {
  private readonly animationActions = new Map<PlayerAnimationName, THREE.AnimationAction>();
  private animationMixer: THREE.AnimationMixer | null = null;
  private activeAnimation: PlayerAnimationName | null = null;
  private jumpStartAnimationTimer = 0;
  private landAnimationTimer = 0;
  private dashAnimationTimer = 0;
  private wallHitAnimationTimer = 0;
  private spawnAnimationTimer = 0;

  async loadVisualModel(group: THREE.Group) {
    const [modelGltf, generalGltf, movementGltf, movementAdvancedGltf] = await Promise.all([
      loadGltf(characterMannequinAsset("medium")),
      loadGltf(characterAnimationAsset("medium", "general")),
      loadGltf(characterAnimationAsset("medium", "movement_basic")),
      loadGltf(characterAnimationAsset("medium", "movement_advanced")),
    ]);

    const model = modelGltf.scene;
    model.scale.setScalar(PLAYER_MODEL_SCALE);
    model.position.y = PLAYER_MODEL_OFFSET_Y;
    remapMannequinBodyColor(model, PLAYER_BODY_COLOR);
    model.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.castShadow = true;
        // Self-shadowing on the animated mannequin creates visible flicker.
        node.receiveShadow = false;
      }
    });
    group.add(model);

    this.attach(model, generalGltf.animations, movementGltf.animations, movementAdvancedGltf.animations);
  }

  private attach(
    model: THREE.Group,
    generalClips: THREE.AnimationClip[],
    movementClips: THREE.AnimationClip[],
    movementAdvancedClips: THREE.AnimationClip[],
  ) {
    this.animationMixer = new THREE.AnimationMixer(model);
    this.animationActions.clear();
    this.activeAnimation = null;
    this.bindAnimation("idle", model, generalClips, "Idle_A");
    this.bindAnimation("wallHit", model, generalClips, "Hit_B", true);
    this.bindAnimation("spawn", model, generalClips, "Spawn_Ground", true);
    this.bindAnimation("run", model, movementClips, "Running_B");
    this.bindAnimation("jumpStart", model, movementClips, "Jump_Start", true);
    this.bindAnimation("jumpIdle", model, movementClips, "Jump_Idle");
    this.bindAnimation("jumpLand", model, movementClips, "Jump_Land", true);
    this.bindAnimation("dash", model, movementAdvancedClips, "Dodge_Forward", true);
    this.playAnimation("idle", 0);
  }

  reset() {
    this.jumpStartAnimationTimer = 0;
    this.landAnimationTimer = 0;
    this.dashAnimationTimer = 0;
    this.wallHitAnimationTimer = 0;
    this.spawnAnimationTimer = 0;
    this.playAnimation("idle", 0.05);
  }

  startDash() {
    this.dashAnimationTimer = DASH_ANIMATION_SECONDS;
    this.wallHitAnimationTimer = 0;
    this.spawnAnimationTimer = 0;
    this.jumpStartAnimationTimer = 0;
    this.landAnimationTimer = 0;
  }

  startWallHit() {
    this.wallHitAnimationTimer = WALL_HIT_ANIMATION_SECONDS;
    this.dashAnimationTimer = 0;
    this.spawnAnimationTimer = 0;
    this.jumpStartAnimationTimer = 0;
    this.landAnimationTimer = 0;
  }

  startSpawn() {
    this.spawnAnimationTimer = SPAWN_ANIMATION_SECONDS;
    this.wallHitAnimationTimer = 0;
    this.dashAnimationTimer = 0;
    this.jumpStartAnimationTimer = 0;
    this.landAnimationTimer = 0;
  }

  startJump() {
    this.jumpStartAnimationTimer = JUMP_START_ANIMATION_SECONDS;
    this.wallHitAnimationTimer = 0;
    this.spawnAnimationTimer = 0;
    this.landAnimationTimer = 0;
  }

  update(dt: number, state: PlayerAnimationFrameState) {
    if (!this.animationMixer) {
      return;
    }

    if (!state.hadGroundContact && state.hasGroundContact) {
      this.landAnimationTimer = LAND_ANIMATION_SECONDS;
    }

    const desired = this.advanceAndSelectAnimation(state.wantsRunAnimation, state.hasGroundContact, dt);
    const action = this.animationActions.get(desired);
    if (action && desired === "run") {
      action.timeScale = THREE.MathUtils.clamp(state.horizontalSpeed / RUN_ANIMATION_BASE_SPEED, 0.8, 1.65);
    } else if (action && (desired === "jumpStart" || desired === "jumpLand")) {
      action.timeScale = 2;
    } else if (action) {
      action.timeScale = 1;
    }

    this.playAnimation(desired);
    this.animationMixer.update(dt);
  }

  private bindAnimation(
    name: PlayerAnimationName,
    model: THREE.Group,
    clips: THREE.AnimationClip[],
    clipName: string,
    once = false,
  ) {
    if (!this.animationMixer) {
      return;
    }

    const sourceClip = THREE.AnimationClip.findByName(clips, clipName);
    if (!sourceClip) {
      console.warn(`Missing player animation clip: ${clipName}`);
      return;
    }

    const clip = this.filterClipForModel(sourceClip, model);
    const action = this.animationMixer.clipAction(clip);
    if (once) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
    }
    this.animationActions.set(name, action);
  }

  private filterClipForModel(clip: THREE.AnimationClip, model: THREE.Group) {
    const tracks = clip.tracks.filter((track) => {
      const { nodeName } = THREE.PropertyBinding.parseTrackName(track.name);
      return model.getObjectByName(nodeName) !== undefined;
    });

    if (tracks.length === clip.tracks.length) {
      return clip;
    }

    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  }

  private advanceAndSelectAnimation(
    wantsRunAnimation: boolean,
    hasGroundContact: boolean,
    dt: number,
  ): PlayerAnimationName {
    if (this.wallHitAnimationTimer > 0) {
      this.wallHitAnimationTimer = Math.max(0, this.wallHitAnimationTimer - dt);
      return "wallHit";
    }

    if (this.dashAnimationTimer > 0) {
      this.dashAnimationTimer = Math.max(0, this.dashAnimationTimer - dt);
      return "dash";
    }

    if (this.jumpStartAnimationTimer > 0) {
      this.jumpStartAnimationTimer = Math.max(0, this.jumpStartAnimationTimer - dt);
      return "jumpStart";
    }

    if (this.spawnAnimationTimer > 0) {
      this.spawnAnimationTimer = Math.max(0, this.spawnAnimationTimer - dt);
      return "spawn";
    }

    if (this.landAnimationTimer > 0) {
      this.landAnimationTimer = Math.max(0, this.landAnimationTimer - dt);
      return "jumpLand";
    }

    if (!hasGroundContact) {
      return "jumpIdle";
    }

    if (wantsRunAnimation) {
      return "run";
    }

    return "idle";
  }

  private playAnimation(name: PlayerAnimationName, fadeSeconds = ANIMATION_FADE_SECONDS) {
    const next = this.animationActions.get(name);
    if (!next || this.activeAnimation === name) {
      return;
    }

    const previous = this.activeAnimation ? this.animationActions.get(this.activeAnimation) : undefined;
    next.enabled = true;
    next.reset();
    if (name === "jumpStart") {
      next.time = JUMP_START_ANIMATION_START_TIME;
    } else if (name === "wallHit") {
      next.time = WALL_HIT_ANIMATION_START_TIME;
    }
    next.setEffectiveWeight(1);
    next.fadeIn(fadeSeconds).play();
    previous?.fadeOut(fadeSeconds);
    this.activeAnimation = name;
  }
}
