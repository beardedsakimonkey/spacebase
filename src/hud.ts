import type { BallTelemetry } from "./Ball";
import type { PlayerTelemetry } from "./Player";

export type DevHudStats = {
  fps: number;
  physicsMs: number;
  player: PlayerTelemetry;
  ball: BallTelemetry;
};

export class DevHud {
  private readonly root = document.createElement("aside");
  private readonly readouts = new Map<string, HTMLElement>();

  constructor() {
    this.root.className = "hud";
    this.root.setAttribute("aria-expanded", "false");

    const header = document.createElement("button");
    header.className = "hud-header";
    header.type = "button";
    header.innerHTML = "<span>Dev HUD</span><span>expand</span>";
    header.addEventListener("click", () => {
      const expanded = this.root.getAttribute("aria-expanded") !== "false";
      this.root.setAttribute("aria-expanded", expanded ? "false" : "true");
      header.lastElementChild!.textContent = expanded ? "expand" : "collapse";
    });

    const body = document.createElement("div");
    body.className = "hud-body";
    body.append(this.createReadouts());

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

  private setReadout(key: string, value: string) {
    const element = this.readouts.get(key);
    if (element) {
      element.textContent = value;
    }
  }
}
