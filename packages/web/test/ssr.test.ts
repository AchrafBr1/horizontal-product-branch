// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as web from "../src/index";
import { fixture } from "./helpers";

describe("SSR safety", () => {
  it("async render works without a DOM", async () => {
    const { svg } = await web.render("ssr2", fixture("A"));
    expect(svg).toContain('id="ssr2"');
    expect(await web.run()).toEqual([]);
  });

  it("imports and renders strings without a DOM", () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
    expect(web.renderSync("ssr", fixture("A"))).toContain('id="ssr"');
    expect(web.runSync()).toEqual([]);
    expect(() => web.defineHpbElement()).not.toThrow();
    expect(() => web.initialize({ startOnLoad: true })).not.toThrow();
  });
});
