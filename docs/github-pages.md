# GitHub Pages Deployment

This app deploys as a static Vite build. GitHub Pages serves the generated files in `dist`; it does not run the Vite dev server.

## Repository Setup

1. Commit the deployment config and runtime inputs:

   ```sh
   git add .github vite.config.ts bun.lock public/assets .gitignore src/assets.ts docs
   ```

2. In the GitHub repository settings, open **Pages** and set **Source** to **GitHub Actions**.

3. Push to `main`, or run **Deploy to GitHub Pages** manually from the Actions tab.

The workflow computes `BASE_PATH` from the repository name. Project pages build with a base path like `/fall_guys/`; a user or organization Pages repo ending in `.github.io` builds at `/`.

## Local Pages Build

To mimic the project-site path locally:

```sh
BASE_PATH=/fall_guys/ bun run build
```

The KayKit runtime subset must be available under `public/assets` before building. This repository intentionally keeps only the GLTF/GLB files the app loads, plus their `.bin` and texture dependencies. The current subset is about 3.3 MB before build, and Vite copies it into the published `dist/assets` directory.
