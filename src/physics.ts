import {
  addBroadphaseLayer,
  addObjectLayer,
  createWorld,
  createWorldSettings,
  enableCollision,
  registerAll,
  type RigidBody,
  type World,
} from "crashcat";
import * as THREE from "three";

export type PhysicsLayers = {
  terrain: number;
  player: number;
  props: number;
  heldProp: number;
  kinematic: number;
};

export type PhysicsEntity = {
  body: RigidBody;
  object: THREE.Object3D;
  sync?: boolean;
};

export type PhysicsContext = {
  world: World;
  layers: PhysicsLayers;
};

export function createPhysicsContext(): PhysicsContext {
  registerAll();

  const settings = createWorldSettings();
  settings.gravity = [0, -9.81, 0];

  const broadphaseStatic = addBroadphaseLayer(settings);
  const broadphaseMoving = addBroadphaseLayer(settings);

  const terrain = addObjectLayer(settings, broadphaseStatic);
  const player = addObjectLayer(settings, broadphaseMoving);
  const props = addObjectLayer(settings, broadphaseMoving);
  const heldProp = addObjectLayer(settings, broadphaseMoving);
  const kinematic = addObjectLayer(settings, broadphaseMoving);

  enableCollision(settings, player, terrain);
  enableCollision(settings, player, props);
  enableCollision(settings, player, kinematic);
  enableCollision(settings, props, terrain);
  enableCollision(settings, props, props);
  enableCollision(settings, props, kinematic);

  return {
    world: createWorld(settings),
    layers: {
      terrain,
      player,
      props,
      heldProp,
      kinematic,
    },
  };
}

export function syncPhysicsEntities(entities: PhysicsEntity[]) {
  for (const entity of entities) {
    if (entity.sync === false) {
      continue;
    }

    const position = entity.body.position;
    const quaternion = entity.body.quaternion;
    entity.object.position.set(position[0], position[1], position[2]);
    entity.object.quaternion.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
  }
}
