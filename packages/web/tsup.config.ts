import { defineConfig } from "tsup";

export default defineConfig([
  // ESM + CJS for bundlers (@hpb/core stays an external dependency).
  {
    entry: { index: "src/index.ts", auto: "src/auto.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: false,
    target: "es2020",
    treeshake: true,
    external: ["@hpb/core"],
  },
  // <script> bundle: core inlined, exposes window.HPB, registers <hpb-diagram>, auto-renders on load.
  {
    entry: { "hpb.min": "src/global.ts" },
    format: ["iife"],
    minify: true,
    sourcemap: true,
    target: "es2019",
    noExternal: ["@hpb/core"],
    outExtension: () => ({ js: ".js" }),
  },
]);
