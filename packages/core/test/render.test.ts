import { describe, expect, it } from "vitest";
import { buildModel, HpbError, parse, renderSVG } from "../src";
import { FIXTURES, fixture } from "./helpers";

describe("renderSVG snapshots (canonical examples A-E)", () => {
  for (const name of FIXTURES) {
    it(name, async () => {
      await expect(renderSVG(fixture(name))).toMatchFileSnapshot(`./__snapshots__/${name}.svg`);
    });
  }
  it("mono theme (example C)", async () => {
    await expect(renderSVG(fixture("C-hardware-revision"), { theme: "mono" })).toMatchFileSnapshot(
      "./__snapshots__/C-hardware-revision.mono.svg"
    );
  });
});

describe("renderSVG", () => {
  it("produces accessible markup", () => {
    const svg = renderSVG(fixture("A-firmware-line"), { idPrefix: "a" });
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" id="a"/);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-labelledby="a-title a-desc"');
    expect(svg).toContain('<title id="a-title">Product A — firmware line</title>');
    expect(svg).toContain('<desc id="a-desc">');
    // every baseline and branch node group starts with a <title>
    const groups = [...svg.matchAll(/<g class="hpb-(?:branch|baseline) [^>]*>(<title>)?/g)];
    expect(groups.length).toBe(4 + 6);
    for (const g of groups) expect(g[1]).toBe("<title>");
  });

  it("never uses text below 10px", () => {
    for (const name of FIXTURES) {
      const sizes = [...renderSVG(fixture(name)).matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(10);
    }
  });

  it("escapes all user text and ids (XSS-safe)", () => {
    const src =
      'hpb "<script>alert(1)</script>"\nline A "<img src=x onerror=alert(1)>"\nrelease v1\nissue X-1 "\\"><svg onload=alert(1)>"\nnote X-1 "a & b < c"';
    const svg = renderSVG(src);
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/<img/i);
    expect(svg).not.toMatch(/<svg onload/i);
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("a &amp; b &lt; c");
    const custom = renderSVG("release v1", { idPrefix: '"><script>' });
    expect(custom).not.toContain("<script>");
    expect(custom).toContain('id="script"');
  });

  it("produces safe element ids for any branch id", () => {
    const svg = renderSVG("release v1.0\nissue X.1_a-b", { idPrefix: "p" });
    expect(svg).toContain('id="p-b-X_2e_1_5f_a-b"');
    expect(svg).toContain('id="p-v-v1_2e_0"');
    expect(svg).toContain('data-hpb-id="X.1_a-b"');
  });

  it("renders an error box instead of throwing by default", () => {
    const svg = renderSVG("release v1\nfoo\nissue X-1 from v9");
    expect(svg).toContain('class="hpb hpb-error"');
    expect(svg).toContain("Line 2:1 [E-SYNTAX]");
    expect(svg).toContain("Line 3:16 [E-UNKNOWN-BASELINE]");
  });

  it("throws HpbError with diagnostics when onError = throw", () => {
    let caught: unknown = null;
    try {
      renderSVG("foo", { onError: "throw" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(HpbError);
    expect((caught as HpbError).diagnostics[0]).toMatchObject({ code: "E-SYNTAX", line: 1, col: 1 });
  });

  it("accepts a model as input", () => {
    const model = buildModel(parse(fixture("B-release-gate")).ast);
    const svg = renderSVG(model, { idPrefix: "m" });
    expect(svg).toContain(">NOW<");
    expect(svg).toContain("gate v2.1");
  });

  it("renders the notation glyphs", () => {
    const b = renderSVG(fixture("B-release-gate"));
    expect(b).toContain('stroke-dasharray="2.6 1.8"'); // planned baseline
    expect(b).toContain("hpb-now-line");
    expect(b).toContain("hpb-path-target");
    expect(b).toContain("hpb-main-planned");
    const c = renderSVG(fixture("C-hardware-revision"));
    expect(c).toContain("hpb-kind-hardware");
    expect(c).toContain("new ref.");
    expect(c).toContain("hpb-line-fork");
    expect(c).toContain(">EoS<");
    expect(c).toContain("hpb-step-pass");
    expect(c).toContain("hpb-step-fail");
    const d = renderSVG(fixture("D-discard-retarget"));
    expect(d).toContain("hpb-terminal-discard");
    expect(d).toContain("hpb-path-retargeted");
    expect(d).toContain('opacity="0.35"');
    expect(d).toContain('font-style="italic"');
    const e = renderSVG(fixture("E-collapsed-history"));
    expect(e).toContain("hpb-collapsed");
    expect(e).toContain(">14<");
  });

  it("mono theme uses greyscale only", () => {
    const svg = renderSVG(fixture("B-release-gate"), { theme: "mono" });
    const colours = new Set([...svg.matchAll(/#([0-9A-Fa-f]{6})/g)].map((m) => m[1].toUpperCase()));
    for (const c of colours) {
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
      expect(Math.max(r, g, b) - Math.min(r, g, b), `#${c}`).toBe(0);
    }
  });

  it("is deterministic (same input, same output)", () => {
    for (const name of FIXTURES) expect(renderSVG(fixture(name))).toBe(renderSVG(fixture(name)));
  });
});
