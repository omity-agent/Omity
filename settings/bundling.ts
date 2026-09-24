import { vocabularyChunks, vocabularyModulePrefix } from "../scripts/vocabularyChunks.ts";
import type { UserConfig } from "vite";
import { proxyAddon } from "../scripts/proxyAddon.ts";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
export const frontendOutput = resolve(root, "dist/frontend");
export const backendPlugins = [proxyAddon];
export const frontendBuild = {
  emptyOutDir: true,
  outDir: frontendOutput,
  rolldownOptions: {
    checks: {
      bundlerTimings: false,
    },
    output: {
      codeSplitting: {
        groups: [
          {
            name: "token-vocabulary",
            priority: 20,
            test: (id) => id.startsWith(vocabularyModulePrefix),
          },
          {
            name: "dependencies",
            test: /[/\\]node_modules[/\\]/,
          },
        ],
        maxSize: 350_000,
      },
      strictExecutionOrder: true,
    },
  },
} satisfies UserConfig["build"];
export const frontendPlugins = [vocabularyChunks(200_000)];
export const highlightWorker = {
  format: "es",
} satisfies UserConfig["worker"];
