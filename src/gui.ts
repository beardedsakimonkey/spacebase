import GUI, { type Controller } from "lil-gui";
import Stats from "stats.js";
import type { PlayerTelemetry } from "./Player";

export type GuiStats = {
  physicsMs: number;
  player: PlayerTelemetry;
};

type GuiValues = {
  physicsMs: string;
  speed: string;
  physicsWireframes: boolean;
};

export class Gui {
  private readonly gui = new GUI({ width: 280 });
  private readonly stats = new Stats();
  private readonly values: GuiValues;
  private readonly readoutControllers: Controller[] = [];

  constructor() {
    this.values = {
      physicsMs: "-",
      speed: "-",
      physicsWireframes: false,
    };

    this.configureStatsPanel();
    this.createReadouts();
    this.createDebugOptions();
  }

  get physicsDebugWireframes() {
    return this.values.physicsWireframes;
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

    for (const controller of this.readoutControllers) {
      controller.updateDisplay();
    }
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
    );
  }

  private createDebugOptions() {
    const folder = this.gui.addFolder("Debug");
    folder.add(this.values, "physicsWireframes").name("Physics Wireframes");
  }
}
