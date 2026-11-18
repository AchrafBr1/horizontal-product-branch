import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: false,
    target: "es2020",
    treeshake: true,
  },
  {
    entry: { index: "src/index.ts" },
    format: ["iife"],
    globalName: "HPBCore",
    minify: true,
    sourcemap: true,
    target: "es2019",
    outExtension: () => ({ js: ".global.js" }),
  },
]);
