export type MovementInput = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
};

export class InputController {
  private readonly keys = new Set<string>();
  private dashPressed = false;
  private pointerX = window.innerWidth / 2;
  private pointerY = window.innerHeight / 2;
  private yawDelta = 0;
  private pitchDelta = 0;

  constructor(private readonly target: HTMLElement) {
    window.addEventListener("keydown", (event) => this.handleKeyDown(event));
    window.addEventListener("keyup", (event) => this.keys.delete(event.code));
    document.addEventListener("pointerlockchange", () => this.handlePointerLockChange());
    target.addEventListener("pointerdown", (event) => this.handlePointerDown(event));
    // In pointer lock, mousemove was sometimes dropping events while focus stayed locked,
    // which made camera rotation feel janky. Use pointermove as the look input source.
    document.addEventListener("pointermove", (event) => this.handlePointerMoveEvent(event));
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

  consumeDashPressed() {
    const pressed = this.dashPressed;
    this.dashPressed = false;
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

    if (event.button === 0) {
      this.dashPressed = true;
    }
  }

  private handlePointerMoveEvent(event: PointerEvent) {
    if (document.pointerLockElement !== this.target) {
      return;
    }

    this.yawDelta += event.movementX;
    this.pitchDelta += event.movementY;
  }

  private handlePointerLockChange() {
    this.pointerX = window.innerWidth / 2;
    this.pointerY = window.innerHeight / 2;
  }
}
