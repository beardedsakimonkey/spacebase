declare module "stats.js" {
  export default class Stats {
    dom: HTMLDivElement;
    domElement: HTMLDivElement;
    begin(): void;
    end(): number;
    update(): void;
    showPanel(id: number): void;
    setMode(id: number): void;
  }
}
