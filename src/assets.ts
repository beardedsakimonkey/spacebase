const PLATFORMER = "/assets/KayKit_Platformer_Pack_1.0_SOURCE/Assets/gltf";
const CHARACTER = "/assets/KayKit_Character_Animations_1.1";

export const ASSETS = {
  platform_yellow: `${PLATFORMER}/yellow/platform_6x6x4_yellow.gltf`,
  platform_blue: `${PLATFORMER}/blue/platform_6x6x4_blue.gltf`,
  platform_red: `${PLATFORMER}/red/platform_6x6x4_red.gltf`,
  barrier_tall: `${PLATFORMER}/red/barrier_4x1x4_red.gltf`,
  barrier_low: `${PLATFORMER}/red/barrier_4x1x2_red.gltf`,
  ball: `${PLATFORMER}/neutral/ball.gltf`,
  mannequin: `${CHARACTER}/Mannequin Character/characters/Mannequin_Medium.glb`,
  rig_general: `${CHARACTER}/Animations/gltf/Rig_Medium/Rig_Medium_General.glb`,
  rig_movement: `${CHARACTER}/Animations/gltf/Rig_Medium/Rig_Medium_MovementBasic.glb`,
} as const;
