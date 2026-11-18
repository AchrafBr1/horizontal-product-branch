import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const built = fs.existsSync(path.join(dist, "index.js"));

describe.skipIf(!built)("build output", () => {
  it('marks the client entry with "use client" (ESM and CJS)', () => {
    for (const f of ["index.js", "index.cjs"]) {
      expect(fs.readFileSync(path.join(dist, f), "utf8").trimStart().startsWith('"use client"'), f).toBe(true);
    }
  });

  it('keeps the server entry free of "use client"', () => {
    for (const f of ["server.js", "server.cjs"]) {
      expect(fs.readFileSync(path.join(dist, f), "utf8")).not.toContain("use client");
    }
  });
});
