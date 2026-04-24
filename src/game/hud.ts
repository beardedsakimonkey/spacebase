import type { BallTelemetry, BallTuning } from "./ball";
import type { PlayerTelemetry, PlayerTuning } from "./player";

type DebugSettings = {
  physics: boolean;
  helpers: boolean;
};

export type ToneMappingMode = "none" | "linear" | "reinhard" | "cineon" | "aces" | "agx" | "neutral";

export type RendererTuning = {
  toneMapping: ToneMappingMode;
  exposure: number;
};

type NumericKey<T> = {
  [K in keyof T]: T[K] extends number ? K : never;
}[keyof T];

type StringKey<T> = {
  [K in keyof T]: T[K] extends string ? K : never;
}[keyof T];

export type DevHudOptions = {
  player: PlayerTuning;
  ball: BallTuning;
  renderer: RendererTuning;
  debug: DebugSettings;
  onToneMappingChange: () => void;
  onBalanceModeChange: () => void;
  onResetPlayer: () => void;
  onResetBall: () => void;
};

export type DevHudStats = {
  fps: number;
  physicsMs: number;
  player: PlayerTelemetry;
  ball: BallTelemetry;
};

export class DevHud {
  private readonly root = document.createElement("aside");
  private readonly readouts = new Map<string, HTMLElement>();

  constructor(private readonly options: DevHudOptions) {
    this.root.className = "hud";
    this.root.setAttribute("aria-expanded", "true");

    const header = document.createElement("button");
    header.className = "hud-header";
    header.type = "button";
    header.innerHTML = "<span>Dev HUD</span><span>collapse</span>";
    header.addEventListener("click", () => {
      const expanded = this.root.getAttribute("aria-expanded") !== "false";
      this.root.setAttribute("aria-expanded", expanded ? "false" : "true");
      header.lastElementChild!.textContent = expanded ? "expand" : "collapse";
    });

    const body = document.createElement("div");
    body.className = "hud-body";
    body.append(
      this.createReadouts(),
      this.createPlayerSection(),
      this.createBallSection(),
      this.createRenderSection(),
      this.createDebugSection(),
      this.createActions(),
    );

    this.root.append(header, body);
    document.body.append(this.root);
  }

  update(stats: DevHudStats) {
    this.setReadout("fps", stats.fps.toFixed(0));
    this.setReadout("step", `${stats.physicsMs.toFixed(2)}ms`);
    this.setReadout("speed", stats.player.speed.toFixed(2));
    this.setReadout("ground", stats.player.grounded ? "ground" : "air");
    this.setReadout("ball", stats.ball.held ? "held" : `${stats.ball.distance.toFixed(1)}m`);
    this.setReadout("jump", stats.player.canJump ? "ready" : "no");
  }

  private createReadouts() {
    const container = document.createElement("div");
    container.className = "readouts";

    for (const [key, label] of [
      ["fps", "FPS"],
      ["step", "Physics"],
      ["speed", "Speed"],
      ["ground", "State"],
      ["ball", "Ball"],
      ["jump", "Jump"],
    ] as const) {
      const readout = document.createElement("div");
      readout.className = "readout";
      const labelElement = document.createElement("span");
      labelElement.className = "readout-label";
      labelElement.textContent = label;
      const value = document.createElement("span");
      value.className = "readout-value";
      value.textContent = "-";
      readout.append(labelElement, value);
      this.readouts.set(key, value);
      container.append(readout);
    }

    return container;
  }

  private createPlayerSection() {
    const section = this.createSection("Movement");
    section.append(
      this.slider(this.options.player, "maxWalkSpeed", "Walk", 2, 14, 0.1),
      this.slider(this.options.player, "maxRunSpeed", "Run", 4, 18, 0.1),
      this.slider(this.options.player, "accelerationTime", "Accel", 2, 16, 0.1),
      this.slider(this.options.player, "turnSpeed", "Turn", 2, 24, 0.1),
      this.slider(this.options.player, "airControlFactor", "Air", 0, 1, 0.01),
      this.slider(this.options.player, "playerFriction", "Friction", 0, 2, 0.01),
      this.slider(this.options.player, "dragDampingC", "Drag", 0, 0.6, 0.01),
      this.slider(this.options.player, "jumpVelocity", "Jump", 3, 11, 0.1),
      this.slider(this.options.player, "airJumpCount", "Air jumps", 0, 3, 1),
      this.slider(this.options.player, "landingDamping", "Landing", 0, 1, 0.01),
      this.slider(this.options.player, "groundedSnapSpeed", "Contact", 0, 40, 0.5),
      this.slider(this.options.player, "dashImpulse", "Dash", 0, 44, 0.1),
      this.slider(this.options.player, "dashDuration", "Dash sec", 0.05, 1.2, 0.01),
      this.slider(this.options.player, "dashUpwardImpulse", "Dash y", 0, 8, 0.1),
      this.slider(this.options.player, "fallingGravityScale", "Fall g", 1, 5, 0.05),
      this.checkbox(this.options.player, "enableAutoBalance", "Balance", this.options.onBalanceModeChange),
      this.slider(this.options.player, "balanceSpringK", "Upright", 0, 1.4, 0.01),
    );
    return section;
  }

  private createBallSection() {
    const section = this.createSection("Ball");
    section.append(
      this.slider(this.options.ball, "pickupRange", "Range", 0.8, 5, 0.05),
      this.slider(this.options.ball, "holdDistance", "Hold dist", 0.6, 2.5, 0.05),
      this.slider(this.options.ball, "holdHeight", "Hold y", -0.2, 1.4, 0.05),
      this.slider(this.options.ball, "throwStrength", "Throw", 4, 60, 0.1),
      this.slider(this.options.ball, "throwMinPower", "Min power", 0, 1, 0.01),
      this.slider(this.options.ball, "throwUpward", "Arc", 0, 18, 0.1),
      this.slider(this.options.ball, "throwChargeSeconds", "Charge", 0.2, 4, 0.05),
    );
    return section;
  }

  private createRenderSection() {
    const section = this.createSection("Render");
    section.append(
      this.select(
        this.options.renderer,
        "toneMapping",
        "Tone map",
        [
          ["aces", "ACES"],
          ["agx", "AgX"],
          ["neutral", "Neutral"],
          ["reinhard", "Reinhard"],
          ["cineon", "Cineon"],
          ["linear", "Linear"],
          ["none", "None"],
        ],
        this.options.onToneMappingChange,
      ),
      this.slider(this.options.renderer, "exposure", "Exposure", 0.2, 2.5, 0.01),
    );
    return section;
  }

  private createDebugSection() {
    const section = this.createSection("Debug");
    section.append(
      this.checkbox(this.options.debug, "physics", "Physics"),
      this.checkbox(this.options.debug, "helpers", "Rays"),
    );
    return section;
  }

  private createActions() {
    const actions = document.createElement("div");
    actions.className = "hud-actions";

    const resetPlayer = document.createElement("button");
    resetPlayer.type = "button";
    resetPlayer.textContent = "Reset Player";
    resetPlayer.addEventListener("click", this.options.onResetPlayer);

    const resetBall = document.createElement("button");
    resetBall.type = "button";
    resetBall.textContent = "Reset Ball";
    resetBall.addEventListener("click", this.options.onResetBall);

    actions.append(resetPlayer, resetBall);
    return actions;
  }

  private createSection(title: string) {
    const section = document.createElement("section");
    section.className = "hud-section";
    const heading = document.createElement("h2");
    heading.className = "hud-section-title";
    heading.textContent = title;
    section.append(heading);
    return section;
  }

  private slider<T extends object>(
    target: T,
    key: NumericKey<T>,
    label: string,
    min: number,
    max: number,
    step: number,
  ) {
    const row = document.createElement("div");
    row.className = "hud-control";

    const labelElement = document.createElement("label");
    labelElement.textContent = label;

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(target[key]);

    const output = document.createElement("output");
    output.value = String(target[key]);
    output.textContent = this.formatNumber(Number(target[key]));

    input.addEventListener("input", () => {
      target[key] = Number(input.value) as T[NumericKey<T>];
      output.value = input.value;
      output.textContent = this.formatNumber(Number(input.value));
    });

    row.append(labelElement, input, output);
    return row;
  }

  private checkbox<T extends object>(
    target: T,
    key: keyof T,
    label: string,
    onChange?: () => void,
  ) {
    const row = document.createElement("div");
    row.className = "hud-control";

    const labelElement = document.createElement("label");
    labelElement.textContent = label;

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(target[key]);
    input.addEventListener("change", () => {
      target[key] = input.checked as T[keyof T];
      onChange?.();
    });

    const spacer = document.createElement("output");
    spacer.textContent = "";

    row.append(labelElement, input, spacer);
    return row;
  }

  private select<T extends object>(
    target: T,
    key: StringKey<T>,
    label: string,
    options: Array<[T[StringKey<T>], string]>,
    onChange?: () => void,
  ) {
    const row = document.createElement("div");
    row.className = "hud-control";

    const labelElement = document.createElement("label");
    labelElement.textContent = label;

    const input = document.createElement("select");
    for (const [value, text] of options) {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = text;
      input.append(option);
    }
    input.value = String(target[key]);
    input.addEventListener("change", () => {
      target[key] = input.value as T[StringKey<T>];
      onChange?.();
    });

    const spacer = document.createElement("output");
    spacer.textContent = "";

    row.append(labelElement, input, spacer);
    return row;
  }

  private setReadout(key: string, value: string) {
    const element = this.readouts.get(key);
    if (element) {
      element.textContent = value;
    }
  }

  private formatNumber(value: number) {
    if (Math.abs(value) >= 10) {
      return value.toFixed(1);
    }
    return value.toFixed(2);
  }
}
