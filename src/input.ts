export type MovementInput = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
};

export class InputController {
  private readonly keys = new Set<string>();
  private interactPressed = false;
  private throwPressed = false;
  private throwReleased = false;
  private resetPressed = false;
  private debugPressed = false;
  private pointerX = window.innerWidth / 2;
  private pointerY = window.innerHeight / 2;
  private hasPointerPosition = false;
  private yawDelta = 0;
  private pitchDelta = 0;

  constructor(private readonly target: HTMLElement) {
    window.addEventListener("keydown", (event) => this.handleKeyDown(event));
    window.addEventListener("keyup", (event) => this.keys.delete(event.code));
    document.addEventListener("pointerlockchange", () => this.handlePointerLockChange());
    target.addEventListener("pointerdown", (event) => this.handlePointerDown(event));
    // mousemove instead of pointermove: Firefox doesn't set movementX/Y on PointerEvent under pointer lock.
    window.addEventListener("mousemove", (event) => this.handlePointerMove(event));
    window.addEventListener("pointerup", (event) => this.handlePointerUp(event));
    window.addEventListener("pointercancel", (event) => this.handlePointerUp(event));
    target.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  get movement(): MovementInput {
    return {
      forward: this.keys.has("KeyW") || this.keys.has("ArrowUp"),
      backward: this.keys.has("KeyS") || this.keys.has("ArrowDown"),
      left: this.keys.has("KeyA") || this.keys.has("ArrowLeft"),
      right: this.keys.has("KeyD") || this.keys.has("ArrowRight"),
      jump: this.keys.has("Space"),
    };
  }

  consumeLookDelta() {
    const delta = { yaw: this.yawDelta, pitch: this.pitchDelta };
    this.yawDelta = 0;
    this.pitchDelta = 0;
    return delta;
  }

  consumeInteractPressed() {
    const pressed = this.interactPressed;
    this.interactPressed = false;
    return pressed;
  }

  consumeThrowPressed() {
    const pressed = this.throwPressed;
    this.throwPressed = false;
    return pressed;
  }

  consumeThrowReleased() {
    const released = this.throwReleased;
    this.throwReleased = false;
    return released;
  }

  consumeResetPressed() {
    const pressed = this.resetPressed;
    this.resetPressed = false;
    return pressed;
  }

  consumeDebugPressed() {
    const pressed = this.debugPressed;
    this.debugPressed = false;
    return pressed;
  }

  getPointerPosition() {
    if (document.pointerLockElement === this.target) {
      return {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      };
    }

    return {
      x: this.pointerX,
      y: this.pointerY,
    };
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (!event.repeat) {
      if (event.code === "KeyE") {
        this.interactPressed = true;
      }
      if (event.code === "KeyR") {
        this.resetPressed = true;
      }
      if (event.code === "Backquote") {
        this.debugPressed = true;
      }
    }

    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
      event.preventDefault();
    }

    this.keys.add(event.code);
  }

  private handlePointerDown(event: PointerEvent) {
    if (document.pointerLockElement !== this.target) {
      this.target.requestPointerLock();
    }

    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.hasPointerPosition = true;

    if (event.button === 0) {
      this.throwPressed = true;
    }
  }

  private handlePointerMove(event: MouseEvent) {
    if (document.pointerLockElement === this.target) {
      this.yawDelta += event.movementX;
      this.pitchDelta += event.movementY;
      return;
    }

    if (!this.hasPointerPosition) {
      this.pointerX = event.clientX;
      this.pointerY = event.clientY;
      this.hasPointerPosition = true;
      return;
    }

    this.yawDelta += event.clientX - this.pointerX;
    this.pitchDelta += event.clientY - this.pointerY;
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
  }

  private handlePointerUp(event: PointerEvent) {
    if (event.button === 0) {
      this.throwReleased = true;
    }
  }

  private handlePointerLockChange() {
    this.pointerX = window.innerWidth / 2;
    this.pointerY = window.innerHeight / 2;
    this.hasPointerPosition = true;
  }
}
