import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Test against the core sources so `pnpm test` works without building core first.
    alias: { "@hpb/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)) },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "happy-dom",
  },
});
