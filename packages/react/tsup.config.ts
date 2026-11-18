import { defineConfig } from "tsup";

const shared = {
  format: ["esm", "cjs"] as ("esm" | "cjs")[],
  dts: true,
  sourcemap: true,
  clean: false,
  target: "es2020",
  treeshake: true,
  external: ["react", "react-dom", "@hpb/core"],
};

export default defineConfig([
  // Client entry: the interactive component. Marked "use client" for the Next.js App Router.
  {
    ...shared,
    entry: { index: "src/index.ts" },
    banner: { js: '"use client";' },
    // Rollup tree-shaking would strip the module-level directive; esbuild output is already minimal.
    treeshake: false,
  },
  // Server entry: plain functions, safe to call from React Server Components.
  {
    ...shared,
    entry: { server: "src/server.ts" },
  },
]);
