// @vitest-environment node
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderSVG } from "../src";
import { fixture } from "./helpers";

describe("SSR", () => {
  it("renders in Node without any DOM globals", () => {
    const g = globalThis as Record<string, unknown>;
    expect(typeof g.window).toBe("undefined");
    expect(typeof g.document).toBe("undefined");
    const svg = renderSVG(fixture("C-hardware-revision"));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
  });

  it("the built CommonJS bundle works with require() (when built)", () => {
    const require = createRequire(import.meta.url);
    const path = fileURLToPath(new URL("../dist/index.cjs", import.meta.url));
    if (!fs.existsSync(path)) return;
    const mod = require(path) as { renderSVG: (s: string) => string; validate: (s: string) => unknown[] };
    expect(mod.renderSVG(fixture("A-firmware-line"))).toContain("<svg");
    expect(mod.validate(fixture("A-firmware-line"))).toEqual([]);
  });
});
