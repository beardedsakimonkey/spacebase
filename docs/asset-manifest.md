# Asset Manifest

This is a quick lookup for the local KayKit assets used by the game. The typed helpers live in `src/assets.ts`.

## Platformer Pack

Root:

```ts
const PLATFORMER_PACK = "/assets/KayKit_Platformer_Pack_1.0_SOURCE";
```

Available colors:

```txt
blue, green, red, yellow
```

Shared textures:

```txt
public/assets/KayKit_Platformer_Pack_1.0_SOURCE/Textures/platformer_texture.png
public/assets/KayKit_Platformer_Pack_1.0_SOURCE/Textures/threads.png
```

Per-color GLTF folders also contain local copies of `platformer_texture.png` and `threads.png`.

## Colored Platformer Models

Each model below exists under every color folder using the pattern:

```txt
Assets/gltf/{color}/{model}_{color}.gltf
```

```txt
arch
arch_tall
arch_wide
ball
barrier_1x1x1
barrier_1x1x2
barrier_1x1x4
barrier_2x1x1
barrier_2x1x2
barrier_2x1x4
barrier_3x1x1
barrier_3x1x2
barrier_3x1x4
barrier_4x1x1
barrier_4x1x2
barrier_4x1x4
bomb_A
bomb_B
bracing_large
bracing_medium
bracing_small
button_base
cannon_base
chest
chest_large
cone
conveyor_2x4x1
conveyor_2x8x1
conveyor_4x4x1
conveyor_4x8x1
diamond
flag_A
flag_B
flag_C
floor_net_2x2x1
floor_net_4x4x1
floor_spikes_trap_2x2x1
floor_spikes_trap_4x4x1
hammer
hammer_large
hammer_large_spikes
hammer_spikes
heart
hoop
hoop_angled
lever_floor_base
lever_wall_base_A
lever_wall_base_B
pipe_180_A
pipe_180_B
pipe_90_A
pipe_90_B
pipe_end
pipe_straight_A
pipe_straight_B
platform_1x1x1
platform_2x2x1
platform_2x2x2
platform_2x2x4
platform_4x2x1
platform_4x2x2
platform_4x2x4
platform_4x4x1
platform_4x4x2
platform_4x4x4
platform_6x2x1
platform_6x2x2
platform_6x2x4
platform_6x6x1
platform_6x6x2
platform_6x6x4
platform_arrow_2x2x1
platform_arrow_4x4x1
platform_decorative_1x1x1
platform_decorative_2x2x2
platform_hole_6x6x1
platform_slope_2x2x2
platform_slope_2x4x4
platform_slope_2x6x4
platform_slope_4x2x2
platform_slope_4x4x4
platform_slope_4x6x4
platform_slope_6x2x2
platform_slope_6x4x4
platform_slope_6x6x4
power
railing_corner_double
railing_corner_padded
railing_corner_single
railing_straight_double
railing_straight_padded
railing_straight_single
safetynet_2x2x1
safetynet_4x2x1
safetynet_6x2x1
saw_trap
saw_trap_double
saw_trap_long
signage_arrow_stand
signage_arrow_wall
signage_arrows_left
signage_arrows_right
spikeblock_double_horizontal
spikeblock_double_vertical
spikeblock_down
spikeblock_left
spikeblock_omni
spikeblock_quad
spikeblock_right
spikeblock_up
spring_pad
star
swiper
swiper_double
swiper_double_long
swiper_long
swiper_quad
swiper_quad_long
```

## Neutral Platformer Models

Neutral models use the pattern:

```txt
Assets/gltf/neutral/{model}.gltf
```

```txt
ball
barrier_1x1x1
barrier_1x1x2
barrier_1x1x4
barrier_2x1x1
barrier_2x1x2
barrier_2x1x4
barrier_3x1x1
barrier_3x1x2
barrier_3x1x4
barrier_4x1x1
barrier_4x1x2
barrier_4x1x4
bomb
cannon_bullet
chain_full
chain_link
chain_link_end_bottom
chain_link_end_top
cone
floor_spikes_2x2x1
floor_spikes_4x4x1
floor_spikes_curved_4x2x2
floor_wood_1x1
floor_wood_2x2
floor_wood_2x6
floor_wood_4x4
hammerblock
hammerblock_spikes
pillar_1x1x1
pillar_1x1x2
pillar_1x1x4
pillar_1x1x8
pillar_2x2x2
pillar_2x2x4
pillar_2x2x8
platform_wood_1x1x1
sawblade
sign
signage_arrows_left
signage_arrows_right
signage_finish
signage_finish_wide
spikeball
spikeball_hanger
spikeroller_horizontal
spikeroller_vertical
spring
structure_A
structure_B
structure_C
strut_horizontal
strut_vertical
```

## Character Pack

This pack contains Large and Medium models and their respective animations. This
list only lists the Medium models.

Root:

```ts
const CHARACTER = "/assets/KayKit_Character_Animations_1.1";
```

Mannequins:

```txt
medium -> Mannequin_Medium.glb
```

Medium rig animation bundles:

```txt
combat_melee -> Rig_Medium_CombatMelee.glb
combat_ranged -> Rig_Medium_CombatRanged.glb
general -> Rig_Medium_General.glb
movement_advanced -> Rig_Medium_MovementAdvanced.glb
movement_basic -> Rig_Medium_MovementBasic.glb
simulation -> Rig_Medium_Simulation.glb
special -> Rig_Medium_Special.glb
tools -> Rig_Medium_Tools.glb
```

Medium rig animation clip names:

```txt
combat_melee:
  Melee_1H_Attack_Chop
  Melee_1H_Attack_Jump_Chop
  Melee_1H_Attack_Slice_Diagonal
  Melee_1H_Attack_Slice_Horizontal
  Melee_1H_Attack_Stab
  Melee_2H_Attack_Chop
  Melee_2H_Attack_Slice
  Melee_2H_Attack_Spin
  Melee_2H_Attack_Spinning
  Melee_2H_Attack_Stab
  Melee_2H_Idle
  Melee_Block
  Melee_Block_Attack
  Melee_Block_Hit
  Melee_Blocking
  Melee_Dualwield_Attack_Chop
  Melee_Dualwield_Attack_Slice
  Melee_Dualwield_Attack_Stab
  Melee_Unarmed_Attack_Kick
  Melee_Unarmed_Attack_Punch_A
  Melee_Unarmed_Idle
  T-Pose

combat_ranged:
  Ranged_1H_Aiming
  Ranged_1H_Reload
  Ranged_1H_Shoot
  Ranged_1H_Shooting
  Ranged_2H_Aiming
  Ranged_2H_Reload
  Ranged_2H_Shoot
  Ranged_2H_Shooting
  Ranged_Bow_Aiming_Idle
  Ranged_Bow_Draw
  Ranged_Bow_Draw_Up
  Ranged_Bow_Idle
  Ranged_Bow_Release
  Ranged_Bow_Release_Up
  Ranged_Magic_Raise
  Ranged_Magic_Shoot
  Ranged_Magic_Spellcasting
  Ranged_Magic_Spellcasting_Long
  Ranged_Magic_Summon
  T-Pose

general:
  Death_A
  Death_A_Pose
  Death_B
  Death_B_Pose
  Hit_A
  Hit_B
  Idle_A
  Idle_B
  Interact
  PickUp
  Spawn_Air
  Spawn_Ground
  T-Pose
  Throw
  Use_Item

movement_advanced:
  Crawling
  Crouching
  Dodge_Backward
  Dodge_Forward
  Dodge_Left
  Dodge_Right
  Running_HoldingBow
  Running_HoldingRifle
  Running_Strafe_Left
  Running_Strafe_Right
  Sneaking
  T-Pose
  Walking_Backwards

movement_basic:
  Jump_Full_Long
  Jump_Full_Short
  Jump_Idle
  Jump_Land
  Jump_Start
  Running_A
  Running_B
  T-Pose
  Walking_A
  Walking_B
  Walking_C

simulation:
  Cheering
  Lie_Down
  Lie_Idle
  Lie_StandUp
  Push_Ups
  Sit_Chair_Down
  Sit_Chair_Idle
  Sit_Chair_StandUp
  Sit_Floor_Down
  Sit_Floor_Idle
  Sit_Floor_StandUp
  Sit_Ups
  T-Pose
  Waving

special:
  EXPERIMENTAL_Medium_Transform
  Skeletons_Awaken_Floor
  Skeletons_Awaken_Floor_Long
  Skeletons_Awaken_Standing
  Skeletons_Death
  Skeletons_Death_Pose
  Skeletons_Death_Resurrect
  Skeletons_Idle
  Skeletons_Inactive_Floor_Pose
  Skeletons_Inactive_Standing_Pose
  Skeletons_Spawn_Ground
  Skeletons_Taunt
  Skeletons_Taunt_Longer
  Skeletons_Walking
  T-Pose

tools:
  Chop
  Chopping
  Dig
  Digging
  Fishing_Bite
  Fishing_Cast
  Fishing_Catch
  Fishing_Idle
  Fishing_Reeling
  Fishing_Struggling
  Fishing_Tug
  Hammer
  Hammering
  Holding_A
  Holding_B
  Holding_C
  Lockpick
  Lockpicking
  Pickaxe
  Pickaxing
  Saw
  Sawing
  T-Pose
  Work_A
  Work_B
  Work_C
  Working_A
  Working_B
  Working_C
```
