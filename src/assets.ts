const withTrailingSlash = (path: string) => (path.endsWith("/") ? path : `${path}/`);
const publicAsset = (path: string) => `${withTrailingSlash(import.meta.env.BASE_URL)}${path.replace(/^\/+/, "")}`;

const PLATFORMER_PACK = publicAsset("assets/KayKit_Platformer_Pack_1.0_SOURCE");
const PLATFORMER_GLTF = `${PLATFORMER_PACK}/Assets/gltf`;
const CHARACTER = publicAsset("assets/KayKit_Character_Animations_1.1");

export const PLATFORMER_COLORS = ["blue", "red"] as const;
export type PlatformerColor = (typeof PLATFORMER_COLORS)[number];

export const PLATFORMER_MODELS = [
  "barrier_4x1x4",
  "conveyor_4x8x1",
  "platform_6x6x4",
  "platform_slope_4x6x4",
  "saw_trap_long",
  "swiper_double_long",
] as const;

export const PLATFORMER_NEUTRAL_MODELS = [
  "ball",
  "chain_link",
  "cone",
  "platform_wood_1x1x1",
  "sign",
  "signage_arrows_left",
  "signage_arrows_right",
  "spikeball_hanger",
  "structure_A",
] as const;

export const CHARACTER_RIG_NAMES = {
  medium: "Rig_Medium",
} as const;

export const CHARACTER_ANIMATIONS = {
  medium: {
    general: "General",
    movement_advanced: "MovementAdvanced",
    movement_basic: "MovementBasic",
  },
} as const;

export const CHARACTER_MANNEQUINS = {
  medium: "Mannequin_Medium",
} as const;

export type PlatformerModel = (typeof PLATFORMER_MODELS)[number];
export type PlatformerNeutralModel = (typeof PLATFORMER_NEUTRAL_MODELS)[number];
export type CharacterRigSize = keyof typeof CHARACTER_RIG_NAMES;
export type CharacterAnimation<TSize extends CharacterRigSize = CharacterRigSize> =
  TSize extends CharacterRigSize ? keyof (typeof CHARACTER_ANIMATIONS)[TSize] : never;
export type CharacterMannequinSize = keyof typeof CHARACTER_MANNEQUINS;

export const platformerAsset = (color: PlatformerColor, model: PlatformerModel) =>
  `${PLATFORMER_GLTF}/${color}/${model}_${color}.gltf`;

export const platformerNeutralAsset = (model: PlatformerNeutralModel) => `${PLATFORMER_GLTF}/neutral/${model}.gltf`;

export const characterAnimationAsset = <TSize extends CharacterRigSize>(
  size: TSize,
  animation: CharacterAnimation<TSize>,
) => {
  const rigName = CHARACTER_RIG_NAMES[size];
  const fileName = CHARACTER_ANIMATIONS[size][animation];
  return `${CHARACTER}/Animations/gltf/${rigName}/${rigName}_${fileName}.glb`;
};

export const characterMannequinAsset = (size: CharacterMannequinSize) =>
  `${CHARACTER}/Mannequin Character/characters/${CHARACTER_MANNEQUINS[size]}.glb`;
