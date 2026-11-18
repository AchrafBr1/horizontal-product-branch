import { defineConfig, type Options } from "tsup";

const shared: Options = {
  entry: { index: "src/index.ts", "markdown-it": "src/markdown-it.ts" },
  dts: true,
  sourcemap: true,
  clean: false,
  tsconfig: "tsconfig.build.json",
  target: "es2020",
  treeshake: true,
  external: ["@hpb/core"],
};

export default defineConfig([
  { ...shared, format: ["esm"] },
  {
    ...shared,
    format: ["cjs"],
    treeshake: false, // esbuild output: the footer below then runs after every export is defined
    // CommonJS consumers (Eleventy, older Docusaurus / VitePress configs) expect the plugin
    // itself from require(): `unified().use(require("remark-hpb"))`, `md.use(require("remark-hpb/markdown-it"))`.
    // Make module.exports the default export, keeping the named exports as properties.
    footer: {
      js: 'if (typeof module.exports.default === "function") module.exports = Object.assign(module.exports.default, module.exports);',
    },
  },
]);
