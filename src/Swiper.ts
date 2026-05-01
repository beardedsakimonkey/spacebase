import type { RigidBody } from "crashcat";

const SWIPER_BODY_KIND = "swiper";

export type SwiperBodyUserData = {
  kind: typeof SWIPER_BODY_KIND;
};

export function isSwiperBody(body: RigidBody) {
  const userData = body.userData as Partial<SwiperBodyUserData> | null;
  return userData?.kind === SWIPER_BODY_KIND;
}

export function createSwiperBodyUserData(): SwiperBodyUserData {
  return { kind: SWIPER_BODY_KIND };
}
