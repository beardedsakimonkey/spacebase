# Asset Manifest

This repository includes only the KayKit files loaded by the current game scene. The typed helpers live in `src/assets.ts`.

## Platformer Pack

Root:

```ts
const PLATFORMER_PACK = publicAsset("assets/KayKit_Platformer_Pack_1.0_SOURCE");
```

Runtime files:

```txt
public/assets/KayKit_Platformer_Pack_1.0_SOURCE/License.txt
public/assets/KayKit_Platformer_Pack_1.0_SOURCE/Assets/gltf/{blue,red}/platformer_texture.png
public/assets/KayKit_Platformer_Pack_1.0_SOURCE/Assets/gltf/{blue,red}/threads.png
public/assets/KayKit_Platformer_Pack_1.0_SOURCE/Assets/gltf/neutral/platformer_texture.png
```

Colored GLTF models:

```txt
blue/barrier_4x1x4_blue.gltf
blue/conveyor_4x8x1_blue.gltf
blue/platform_6x6x4_blue.gltf
blue/platform_slope_4x6x4_blue.gltf
blue/saw_trap_long_blue.gltf
red/barrier_4x1x4_red.gltf
red/conveyor_4x8x1_red.gltf
red/platform_6x6x4_red.gltf
red/platform_slope_4x6x4_red.gltf
red/swiper_double_long_red.gltf
```

Each included `.gltf` has its matching `.bin` file next to it.

Neutral GLTF models:

```txt
ball.gltf
chain_link.gltf
cone.gltf
platform_wood_1x1x1.gltf
sign.gltf
signage_arrows_left.gltf
signage_arrows_right.gltf
spikeball_hanger.gltf
structure_A.gltf
```

Each included `.gltf` has its matching `.bin` file next to it.

## Character Pack

Root:

```ts
const CHARACTER = publicAsset("assets/KayKit_Character_Animations_1.1");
```

Runtime files:

```txt
public/assets/KayKit_Character_Animations_1.1/License.txt
public/assets/KayKit_Character_Animations_1.1/Mannequin Character/characters/Mannequin_Medium.glb
public/assets/KayKit_Character_Animations_1.1/Animations/gltf/Rig_Medium/Rig_Medium_General.glb
public/assets/KayKit_Character_Animations_1.1/Animations/gltf/Rig_Medium/Rig_Medium_MovementBasic.glb
public/assets/KayKit_Character_Animations_1.1/Animations/gltf/Rig_Medium/Rig_Medium_MovementAdvanced.glb
```
