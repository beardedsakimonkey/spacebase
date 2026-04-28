# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (Vite, supports HMR)
npm run build     # Production build
npm run preview   # Preview production build
```

There are no tests. TypeScript type-checking is the primary correctness tool — run `npx tsc --noEmit` to check types without building.

## Architecture

This is a browser-based 3D platformer prototype called AstroBall. Stack: TypeScript + Three.js (rendering) + Crashcat (physics) + Vite (build).

**`src/main.ts`** — entry point and game loop. Runs physics at a fixed 60 Hz timestep decoupled from render. Owns throw charge logic and trajectory preview state. Orchestrates all other systems.

**`src/Arena.ts`** — level design. Builds the static environment: platforms, conveyor belts, ramps, barriers. Uses instanced meshes for repeated tiles. The arena has two symmetric halves (blue/red) connected by a central conveyor corridor.

**`src/Player.ts`** — character controller (largest module). Capsule collider. Implements walking, jumping (with air jumps), dashing, slope detection, and auto-balance (springs rotation back to upright). Uses raycasting for ground detection. Animation state machine: Idle/Run/JumpStart/JumpIdle/JumpLand.

**`src/Ball.ts`** — the throwable prop. Sphere collider. Switches collision layers when held so it doesn't block the player. Throw velocity is computed from charge level (0.45–1.0 power multiplier).

**`src/physics.ts`** — Crashcat world setup. Defines collision layers (`terrain`, `player`, `props`, `heldProp`, `kinematic`) and the matrix of which layers interact with each other.

**`src/conveyor.ts`** — moving platform logic. Applies surface velocity to contacting bodies; scrolls the belt texture to visualize motion.

**`src/input.ts`** — keyboard (WASD/Space/E/R) and mouse (pointer lock for camera, drag for aim). Single source of truth for raw input each frame.

**`src/camera.ts`** — third-person follow camera. Yaw/pitch via mouse. Adjusts follow distance based on pitch. Provides screen-to-world ray for aim targeting.

**`src/assets.ts`** / **`src/kaykit.ts`** — asset path helpers and glTF loader utilities (single mesh extract, instanced mesh builder). 3D models come from the KayKit asset library and must live under `/assets/`.

**`src/hud.ts`** / **`src/throw-preview.ts`** — dev overlay (FPS, physics step, player state) and throw charge meter + parabolic trajectory preview tube.
