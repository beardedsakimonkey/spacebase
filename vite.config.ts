import { defineConfig } from "vite";

const configuredBasePath = process.env.BASE_PATH ?? "/";
const base = configuredBasePath.endsWith("/") ? configuredBasePath : `${configuredBasePath}/`;

export default defineConfig({
  base,
});
