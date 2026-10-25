import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { frontendBuild, frontendPlugins, highlightWorker } from "./settings/bundling.ts";

const root = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  base: "./",
  build: frontendBuild,
  plugins: [
    ...frontendPlugins,
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
  ],
  resolve: {
    alias: {
      "styled-system": resolve(root, "styled-system"),
    },
    dedupe: ["@codemirror/state", "@codemirror/view"],
  },
  root: "src/app/frontend",
  server: {
    strictPort: false,
  },
  worker: highlightWorker,
});
