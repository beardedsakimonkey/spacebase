import GUI, { type Controller } from "lil-gui";
import Stats from "stats.js";
import type { BallTelemetry } from "./Ball";
import type { PlayerTelemetry } from "./Player";

export type GuiStats = {
  physicsMs: number;
  player: PlayerTelemetry;
  ball: BallTelemetry;
};

export type GuiDebugState = {
  sunShadow: boolean;
};

export type GuiOptions = {
  debugState: GuiDebugState;
  onSunShadowDebugChange: (enabled: boolean) => void;
};

type GuiValues = {
  physicsMs: string;
  speed: string;
  state: string;
  ball: string;
  jump: string;
  sunShadow: boolean;
};

export class Gui {
  private readonly gui = new GUI({ title: "Dev HUD", width: 280 });
  private readonly stats = new Stats();
  private readonly values: GuiValues;
  private readonly readoutControllers: Controller[] = [];
  private sunShadowController?: Controller;

  constructor(options?: GuiOptions) {
    this.values = {
      physicsMs: "-",
      speed: "-",
      state: "-",
      ball: "-",
      jump: "-",
      sunShadow: options?.debugState.sunShadow ?? false,
    };

    this.configureStatsPanel();
    this.createReadouts();
    if (options) {
      this.createDebugControls(options);
    }
  }

  beginFrame() {
    this.stats.begin();
  }

  endFrame() {
    this.stats.end();
  }

  update(stats: GuiStats) {
    this.values.physicsMs = `${stats.physicsMs.toFixed(2)}ms`;
    this.values.speed = stats.player.speed.toFixed(2);
    this.values.state = stats.player.grounded ? "ground" : "air";
    this.values.ball = stats.ball.held ? "held" : `${stats.ball.distance.toFixed(1)}m`;
    this.values.jump = stats.player.canJump ? "ready" : "no";

    for (const controller of this.readoutControllers) {
      controller.updateDisplay();
    }
  }

  setDebugState(state: GuiDebugState) {
    this.values.sunShadow = state.sunShadow;
    this.sunShadowController?.updateDisplay();
  }

  private configureStatsPanel() {
    this.stats.showPanel(0);
    this.stats.dom.style.top = "14px";
    this.stats.dom.style.left = "14px";
    this.stats.dom.style.zIndex = "20";
    document.body.append(this.stats.dom);
  }

  private createReadouts() {
    const folder = this.gui.addFolder("Readouts");

    this.readoutControllers.push(
      folder.add(this.values, "physicsMs").name("Physics").disable(),
      folder.add(this.values, "speed").name("Speed").disable(),
      folder.add(this.values, "state").name("State").disable(),
      folder.add(this.values, "ball").name("Ball").disable(),
      folder.add(this.values, "jump").name("Jump").disable(),
    );
  }

  private createDebugControls(options: GuiOptions) {
    const folder = this.gui.addFolder("Debug");
    this.sunShadowController = folder
      .add(this.values, "sunShadow")
      .name("Sun Shadow")
      .onChange((enabled: boolean) => {
        options.onSunShadowDebugChange(enabled);
      });
  }
}
