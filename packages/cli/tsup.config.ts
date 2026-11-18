import { defineConfig } from "tsup";

export default defineConfig([
  {
    // Programmatic API: import { run } from "@hpb/cli"
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: false,
    tsconfig: "tsconfig.build.json",
    target: "node20",
    platform: "node",
    external: ["@hpb/core"],
  },
  {
    // Executable: `hpb`
    entry: { cli: "src/bin.ts" },
    format: ["esm"],
    sourcemap: false,
    clean: false,
    tsconfig: "tsconfig.build.json",
    target: "node20",
    platform: "node",
    external: ["@hpb/core"],
    banner: { js: "#!/usr/bin/env node" },
  },
]);
