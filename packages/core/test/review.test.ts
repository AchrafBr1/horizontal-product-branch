import { describe, expect, it } from "vitest";
import { buildModel, checkOptions, layout, parse, renderDiagram, renderSVG, validate } from "../src/index";
import { fixture } from "./helpers";

const codes = (src: string) => validate(src).map((d) => d.code);
const model = (src: string) => buildModel(parse(src).ast);

describe("rules R5-R7 and the rationale part of R2", () => {
  it("R2: a discard without rationale is a warning", () => {
    const d = validate("release v1\nissue X-1\ndiscard X-1");
    expect(d).toEqual([expect.objectContaining({ code: "R2", severity: "warning", line: 3 })]);
    expect(validate('release v1\nissue X-1\ndiscard X-1 "duplicate"')).toEqual([]);
  });

  it("R5: a line fork needs a released hardware baseline; a fork never redeclares a line", () => {
    expect(codes("line A\nrelease v1\nline B from v1")).toContain("R5");
    expect(codes("line A\nrelease v1 hardware\nline A from v1")).toContain("E-DUP-LINE");
    const late = validate("line A\nrelease v1\neos A\nissue X-1");
    expect(late).toEqual([expect.objectContaining({ code: "W-AFTER-EOS", severity: "warning" })]);
    expect(late[0].message).toContain("Rule R5");
  });

  it("R6: unknown branch type or step state", () => {
    expect(validate('release v1\nepic E-1 "Big thing"')).toEqual([
      expect.objectContaining({ code: "R6", line: 2, col: 1 }),
    ]);
    expect(validate('release v1\nisue X-1 "Typo"')[0].message).toMatch(/Did you mean 'issue'/);
    expect(codes("release v1\nissue X-1\nstep X-1 maybe")).toEqual(["R6"]);
  });

  it("R7: a note attaches to exactly one existing line, baseline or branch", () => {
    expect(codes('line A\nrelease v1\nnote nowhere "x"')).toEqual(["R7"]);
    const m = model('line A "Product A"\nrelease v1\nnote A "owned by team X"');
    expect(m.lines[0].notes).toEqual(["owned by team X"]);
    expect(codes('line v1\nrelease v1\nnote v1 "which one?"')).toEqual(["R7"]);
    // A line note is drawn, anchored on the line origin.
    const svg = renderSVG('line A "Product A"\nrelease v1\nnote A "owned by team X"');
    expect(svg).toContain('data-hpb-ref="A"');
    expect(svg).toContain(">owned by team X<");
  });
});

describe("diagnostic messages", () => {
  it("duplicates name the earlier definition", () => {
    const d = validate('line A\nrelease v1\nissue v1 "a"');
    expect(d[0]).toMatchObject({ code: "E-DUP-BRANCH", line: 3 });
    expect(d[0].message).toBe("Id 'v1' is already used by baseline v1 (line 2).");
    expect(validate('release v1\nissue X-1\nplan X-1')[0].message).toContain("by branch X-1 (line 2)");
  });

  it("a rejected branch id does not cascade into 'unknown branch'", () => {
    expect(codes('line A\nrelease v1\nissue v1 "a"\nrelease v2 merges v1')).toEqual(["E-DUP-BRANCH"]);
    expect(codes('line A\nissue X-1 "no release yet"\nstep X-1 done\nmerge X-1 into v1')).toEqual(["R1"]);
    expect(validate("release v1\nstep v1 done")[0].message).toContain("'v1' is a baseline by baseline v1 (line 1), not a branch.");
  });

  it("repeated ids in one merges / targets list", () => {
    const d = validate("release v1\nissue X-1\nrelease v2 merges X-1, X-1");
    expect(d).toEqual([expect.objectContaining({ code: "E-DUP-IN-LIST", line: 3, col: 24 })]);
    expect(codes("release v1\nissue X-1\nnow\nplan v2 targets X-1, X-1")).toEqual(["E-DUP-IN-LIST"]);
  });

  it("one syntax error per line and a hint for non-HPB input", () => {
    const ts = Array.from({ length: 40 }, (_, i) => `const a${i} = { b: [${i}] }; // c`).join("\n");
    const d = validate(ts);
    expect(d[0].code).toBe("E-NOT-HPB");
    expect(d[0].message).toMatch(/Is this an HPB Markup file\?/);
    const perLine = new Map<number, number>();
    for (const x of d.slice(1)) perLine.set(x.line, (perLine.get(x.line) ?? 0) + 1);
    expect(Math.max(...perLine.values())).toBe(1);
    expect(d.length).toBe(41);
    // A single bad line in a real file gets no hint.
    expect(codes(fixture("A-firmware-line") + "\nrelase v9\n")).toEqual(["E-SYNTAX"]);
  });
});

describe("renderer options", () => {
  it("checkOptions reports bad values as E-OPTION warnings", () => {
    expect(checkOptions({ theme: "default", labels: "ref", colWidth: 60 })).toEqual([]);
    const d = checkOptions({ theme: "drak" as never, labels: "bogus" as never, colWidth: "abc" as never, padding: 999 });
    expect(d.map((x) => x.code)).toEqual(["E-OPTION", "E-OPTION", "E-OPTION", "E-OPTION"]);
    expect(d[0].message).toMatch(/Did you mean 'dark'/);
    expect(d.every((x) => x.severity === "warning" && x.line === 0)).toBe(true);
  });

  it("renderDiagram returns option warnings; onError: throw turns them into a TypeError", () => {
    const { svg, diagnostics } = renderDiagram(fixture("A-firmware-line"), { theme: "neon" as never });
    expect(svg).toContain("hpb-theme-default");
    expect(diagnostics).toEqual([expect.objectContaining({ code: "E-OPTION" })]);
    expect(validate("release v1", { labels: "x" as never })).toEqual([expect.objectContaining({ code: "E-OPTION" })]);
    expect(() => renderSVG("release v1", { theme: "neon" as never, onError: "throw" })).toThrow(TypeError);
  });
});

describe("theme auto", () => {
  it("one SVG for light and dark: light colours as fallback, CSS variables for both modes", () => {
    const svg = renderSVG(fixture("B-release-gate"), { theme: "auto", idPrefix: "au" });
    expect(svg).toContain('class="hpb hpb-theme-auto"');
    expect(svg).toContain("<style>:where(#au){--hpb-background:#FFFFFF;");
    expect(svg).toContain("@media (prefers-color-scheme: dark){:where(#au){--hpb-background:#0F172A;");
    expect(svg).toContain('fill="#FFFFFF" style="fill:var(--hpb-background,#FFFFFF)"');
    expect(svg).not.toContain("@@hpb-");
    // Every element has at most one style attribute.
    for (const tag of svg.match(/<[a-z][^>]*>/g) ?? []) expect((tag.match(/ style="/g) ?? []).length).toBeLessThanOrEqual(1);
    expect(renderSVG('hpb\nconfig theme = auto\nrelease v1')).toContain("hpb-theme-auto");
  });
});

describe("notation details", () => {
  it("forks from the same baseline get distinct corner columns (no knot)", () => {
    const L = layout(model(fixture("B-release-gate")));
    const fromV20 = L.branches.filter((b) => b.fork === "v2.0" && b.lane < 0);
    expect(fromV20.length).toBeGreaterThanOrEqual(2);
    const dropXs = fromV20.map((b) => b.solid[1].x).sort((a, b) => a - b);
    for (let i = 1; i < dropXs.length; i++) expect(dropXs[i] - dropXs[i - 1]).toBeGreaterThanOrEqual(6);
  });

  it("one legend chip per type; stacked lanes get a marker", () => {
    const svg = renderSVG(fixture("E-collapsed-history"));
    for (const label of ["Issue (X)", "Task (T)", "Lab (L)", "Improvement (I)"]) {
      expect(svg.split(`>${label}<`).length - 1).toBe(1);
    }
    expect(svg.split('class="hpb-legend-stack"').length - 1).toBe(4);
  });

  it("the discard rationale has a knock-out behind it", () => {
    const svg = renderSVG(fixture("D-discard-retarget"));
    expect(svg.split('class="hpb-reason-bg"').length - 1).toBe(2);
  });
});

describe("reference examples A-E match the paper figures", () => {
  // Counts read from the paper's figures (figures/*.tex): branches, baselines,
  // branches open at NOW, collapsed badges.
  const paper: Record<string, { branches: number; baselines: number; open: number; collapsed?: number[] }> = {
    "A-firmware-line": { branches: 6, baselines: 4, open: 0 }, // software-line.tex
    "B-release-gate": { branches: 5, baselines: 4, open: 4 }, // release-gate.tex
    "C-hardware-revision": { branches: 4, baselines: 7, open: 0 }, // hardware-fork.tex
    "D-discard-retarget": { branches: 5, baselines: 4, open: 2 }, // discard.tex
    "E-collapsed-history": { branches: 10, baselines: 5, open: 8, collapsed: [14, 9, 21, 12] }, // scale.tex
  };
  for (const [name, want] of Object.entries(paper)) {
    it(name, () => {
      const src = fixture(name);
      expect(validate(src)).toEqual([]);
      const m = model(src);
      expect(m.branches.length).toBe(want.branches);
      expect(m.baselines.length).toBe(want.baselines);
      expect(m.branches.filter((b) => b.end.kind === "open").length).toBe(want.open);
      if (want.collapsed) expect(m.baselines.map((b) => b.collapsed).filter((n) => n > 0)).toEqual(want.collapsed);
    });
  }
});
