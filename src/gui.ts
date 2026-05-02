import GUI, { type Controller } from "lil-gui";
import Stats from "stats-gl";
import type { PlayerTelemetry } from "./Player";

export type GuiStats = {
  player: PlayerTelemetry;
};

type GuiValues = {
  speed: string;
  animation: string;
  physicsWireframes: boolean;
};

export class Gui {
  private readonly gui = new GUI({ title: '', width: 280 });
  private readonly stats = new Stats({
    horizontal: true,
    mode: 0,
    trackFPS: true,
    trackGPU: false,
  });
  private readonly values: GuiValues = {
    speed: "-",
    animation: "-",
    physicsWireframes: false,
  };
  private readonly readoutControllers: Controller[] = [];

  constructor() {
    this.configureGuiPanel();
    this.createStatsPanel();
    this.addReadoutsFolder();
    this.addDebugFolder();
  }

  get physicsDebugWireframes() {
    return this.values.physicsWireframes;
  }

  beginFrame() {
    this.stats.begin();
  }

  endFrame() {
    this.stats.end();
    this.stats.update();
  }

  update(stats: GuiStats) {
    this.values.speed = stats.player.speed.toFixed(2);
    this.values.animation = stats.player.animation ?? "-";

    for (const controller of this.readoutControllers) {
      controller.updateDisplay();
    }
  }

  private configureGuiPanel() {
    const panel = this.gui.domElement;
    panel.style.top = "46px";
    panel.style.left = "0px";
  }

  private createStatsPanel() {
    document.body.append(this.stats.dom);
  }

  private addReadoutsFolder() {
    const folder = this.gui.addFolder("Readouts");

    this.readoutControllers.push(
      folder.add(this.values, "speed").name("Speed").disable(),
      folder.add(this.values, "animation").name("Animation").disable(),
    );
  }

  private addDebugFolder() {
    const folder = this.gui.addFolder("Debug");
    folder.add(this.values, "physicsWireframes").name("Physics Wireframes");
  }
}
