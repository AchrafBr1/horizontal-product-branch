import { describe, expect, it } from "vitest";
import { buildModel, layout, parse, type HpbLayout, type HpbOptions } from "../src";
import { FIXTURES, fixture } from "./helpers";

const lay = (src: string, opts: HpbOptions = {}) => layout(buildModel(parse(src).ast), opts);

function laneOverlaps(L: HpbLayout): string[] {
  const out: string[] = [];
  for (let i = 0; i < L.branches.length; i++) {
    for (let j = i + 1; j < L.branches.length; j++) {
      const a = L.branches[i];
      const b = L.branches[j];
      if (a.line !== b.line || a.lane !== b.lane) continue;
      if (a.span.x1 < b.span.x2 && b.span.x1 < a.span.x2) out.push(`${a.id}/${b.id}`);
    }
  }
  return out;
}

const STRESS = [
  "line A",
  "release v1",
  ...Array.from({ length: 12 }, (_, i) => `${["improvement", "issue", "task", "lab"][i % 4]} B-${i} "Branch number ${i}"`),
  "release v2 merges B-0, B-1, B-2",
  ...Array.from({ length: 6 }, (_, i) => `issue Y-${i} "Late ${i}"`),
  'discard B-3 "dropped"',
  "release v3 merges B-4, Y-0",
  "now",
  "plan v4 targets B-5, Y-1, Y-2",
  "plan v5 targets B-6",
].join("\n");

describe("layout", () => {
  it("the stress source is valid", () => {
    expect(buildModel(parse(STRESS).ast).diagnostics).toEqual([]);
  });

  it("never puts two branches on the same lane over overlapping intervals", () => {
    for (const name of FIXTURES) expect(laneOverlaps(lay(fixture(name))), name).toEqual([]);
    expect(laneOverlaps(lay(STRESS))).toEqual([]);
  });

  it("places improvements and labs above, issues and tasks below; labs beyond improvements, tasks beyond issues", () => {
    const L = lay(STRESS);
    for (const b of L.branches) {
      if (b.type === "improvement" || b.type === "lab") expect(b.lane).toBeGreaterThan(0);
      else expect(b.lane).toBeLessThan(0);
    }
    const maxImp = Math.max(...L.branches.filter((b) => b.type === "improvement").map((b) => b.lane));
    const minLab = Math.min(...L.branches.filter((b) => b.type === "lab").map((b) => b.lane));
    expect(minLab).toBeGreaterThan(maxImp);
    const minIss = Math.min(...L.branches.filter((b) => b.type === "issue").map((b) => b.lane));
    const maxTask = Math.max(...L.branches.filter((b) => b.type === "task").map((b) => b.lane));
    expect(maxTask).toBeLessThan(minIss);
  });

  it("reuses a lane after its branch closes (greedy interval partitioning)", () => {
    const L = lay(fixture("A-firmware-line"));
    const lane = (id: string) => L.branches.find((b) => b.id === id)?.lane;
    expect(lane("X-101")).toBe(-1);
    expect(lane("X-102")).toBe(-1);
    expect(lane("X-103")).toBe(-1);
    expect(lane("T-8")).toBe(-2);
    expect(lane("I-21")).toBe(1);
    expect(lane("I-22")).toBe(1);
  });

  it("is ordinal: columns follow statement order, planned baselines sit right of NOW", () => {
    const L = lay(fixture("B-release-gate"));
    const xs = L.columns.map((c) => c.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    const now = L.now?.x as number;
    for (const b of L.baselines) {
      if (b.status === "planned") expect(b.x).toBeGreaterThan(now);
      else expect(b.x).toBeLessThan(now);
    }
  });

  it("draws NOW only when there is a present (now, plans or open branches)", () => {
    expect(lay(fixture("A-firmware-line")).now).toBeNull();
    expect(lay(fixture("E-collapsed-history")).now).not.toBeNull();
  });

  it("does not overlap tags of consecutive baselines on the same line", () => {
    for (const name of [...FIXTURES.map(fixture), STRESS]) {
      const L = lay(name);
      for (const band of L.bands) {
        const tags = L.baselines.filter((b) => b.line === band.line).map((b) => b.tag).sort((a, b) => a.x - b.x);
        for (let i = 1; i < tags.length; i++) {
          expect(tags[i - 1].x + tags[i - 1].width / 2).toBeLessThan(tags[i].x - tags[i].width / 2);
        }
      }
    }
  });

  it("keeps each branch label on its own lane run (before its rise or its NOW head)", () => {
    for (const src of [...FIXTURES.map(fixture), STRESS]) {
      const L = lay(src);
      for (const b of L.branches) {
        if (!b.label || b.state === "discarded") continue;
        let runEnd: number;
        if (b.state === "merged") runEnd = b.solid[b.solid.length - 3].x; // x of the rise
        else runEnd = (b.terminal as { x: number }).x - 10.5;
        expect(b.label.x + b.label.width, b.id).toBeLessThanOrEqual(runEnd + 0.5);
      }
    }
  });

  it("gives each product line its own band, child lines above the parent, with a fork connector", () => {
    const L = lay(fixture("C-hardware-revision"));
    expect(L.bands.map((b) => b.line)).toEqual(["RB", "RA"]);
    const [rb, ra] = L.bands;
    expect(rb.mainY).toBeLessThan(ra.mainY);
    expect(rb.fork).toMatchObject({ fromY: ra.mainY, toY: rb.mainY });
    expect(rb.separatorY).not.toBeNull();
    expect(ra.eosX).not.toBeNull();
  });

  it("hides closed branches with showClosed=false and counts them on the badge", () => {
    const src = "release v1\nissue X-1\nissue X-2\nrelease v2 merges X-1, X-2\nissue X-3\ncollapse v2 5";
    const L = lay(src, { showClosed: false });
    expect(L.branches.map((b) => b.id)).toEqual(["X-3"]);
    expect(L.baselines.find((b) => b.id === "v2")?.collapsed).toBe(7);
  });

  it("is deterministic", () => {
    for (const name of FIXTURES) expect(JSON.stringify(lay(fixture(name)))).toBe(JSON.stringify(lay(fixture(name))));
  });

  it("respects colWidth and laneHeight", () => {
    const a = lay(fixture("A-firmware-line"), { colWidth: 48, laneHeight: 40 });
    const b = lay(fixture("A-firmware-line"), { colWidth: 80, laneHeight: 60 });
    expect(b.width).toBeGreaterThan(a.width);
    expect(b.height).toBeGreaterThan(a.height);
  });
  it("keeps labels clear of collapsed badges and of other branches' verticals", () => {
    const src = [
      "config showClosed = false",
      "line B",
      "release v1.0",
      "collapse v1.0 14",
      'task T-14 "EMC re-test"',
      "release v2.0",
      "collapse v2.0 21",
      'issue X-88 "Rare reboot with a long title"',
      "release v2.1",
      "collapse v2.1 12",
      'improvement I-42 "Fleet dashboard with a long title"',
      'improvement I-41 "Quick setup"',
      "release v2.2 merges I-41",
      'improvement I-45 "Voice UI"',
      "now",
    ].join("\n");
    const L = lay(src, { showClosed: false });
    for (const br of L.branches) {
      if (!br.label) continue;
      const x1 = br.label.x;
      const x2 = br.label.x + br.label.width;
      if (br.lane < 0) {
        for (const b of L.baselines) {
          if (b.collapsed > 0 && b.line === br.line) expect(b.x + 8 <= x1 || b.x - 8 >= x2, `${br.id} over badge ${b.id}`).toBe(true);
        }
      }
      for (const o of L.branches) {
        if (o === br || Math.sign(o.lane) !== Math.sign(br.lane)) continue;
        for (let i = 1; i < o.solid.length; i++) {
          const p = o.solid[i - 1];
          const q = o.solid[i];
          if (p.x !== q.x) continue;
          const crosses = Math.min(p.y, q.y) < br.label.y && Math.max(p.y, q.y) > br.label.y - 10;
          if (crosses) expect(p.x <= x1 || p.x >= x2, `${o.id} vertical crosses label of ${br.id}`).toBe(true);
        }
      }
    }
  });
});
