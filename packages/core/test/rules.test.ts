import { describe, expect, it } from "vitest";
import { buildModel, parse, validate } from "../src";
import { FIXTURES, fixture } from "./helpers";

const codes = (src: string) => validate(src).map((d) => d.code);
const model = (src: string) => buildModel(parse(src).ast);

describe("model rules", () => {
  it("accepts the canonical examples with no errors", () => {
    for (const name of FIXTURES) {
      expect(validate(fixture(name)).filter((d) => d.severity === "error"), name).toEqual([]);
    }
  });

  it("R1: a branch forks from the latest released baseline of its line", () => {
    const m = model("line A\nrelease v1\nrelease v2\nissue X-1\nimprovement I-1 from v1");
    expect(m.branches.find((b) => b.id === "X-1")?.fork).toBe("v2");
    expect(m.branches.find((b) => b.id === "I-1")?.fork).toBe("v1");
  });

  it("R1: error when there is no released baseline to fork from", () => {
    const d = validate('line A\nissue X-1 "too early"');
    expect(d[0]).toMatchObject({ code: "R1", severity: "error", line: 2, col: 7 });
  });

  it("R1: error when forking from a planned baseline", () => {
    expect(codes("release v1\nplan v2\nissue X-1 from v2")).toContain("R1");
  });

  it("R2: a branch ends exactly once", () => {
    expect(codes("release v1\nissue X-1\nrelease v2 merges X-1\nrelease v3 merges X-1")).toContain("R2");
    expect(codes('release v1\nissue X-1\ndiscard X-1 "dup"\nrelease v2 merges X-1')).toContain("R2");
    expect(codes("release v1\nissue X-1\nrelease v2 merges X-1\nstep X-1 done")).toContain("R2");
    expect(codes("release v1\nissue X-1\ndiscard X-1\nnow\nplan v2 targets X-1")).toContain("R2");
  });

  it("R3: never merge into a baseline older than (or equal to) the fork", () => {
    const d = validate("release v1\nrelease v2\nissue X-1 from v2\nmerge X-1 into v1");
    expect(d.find((x) => x.code === "R3")).toMatchObject({ line: 4, col: 7 });
    expect(codes("release v1\nissue X-1\nmerge X-1 into v1")).toContain("R3");
  });

  it("merging into a baseline released before the merge statement is an error", () => {
    expect(codes("release v1\nissue X-1\nrelease v2\nmerge X-1 into v2")).toContain("E-MERGE-PAST");
  });

  it("R4: a planned baseline is not released while targeted branches are open", () => {
    const d = validate("release v1\nimprovement I-1\nplan v2 targets I-1\nrelease v2");
    expect(d.find((x) => x.code === "R4")).toMatchObject({ severity: "error", line: 4, col: 9 });
  });

  it("R4: merging the targeted branches satisfies the gate", () => {
    expect(codes("release v1\nimprovement I-1\nplan v2 targets I-1\nrelease v2 merges I-1")).toEqual([]);
    expect(codes("release v1\nimprovement I-1\nplan v2 targets I-1\nmerge I-1 into v2\nrelease v2")).toEqual([]);
  });

  it("R4: 'force' downgrades the error to a warning and marks the baseline", () => {
    const src = "release v1\nimprovement I-1\nplan v2 targets I-1\nrelease v2 force";
    expect(validate(src).map((d) => [d.code, d.severity])).toEqual([["W-R4-FORCED", "warning"]]);
    expect(model(src).baselines.find((b) => b.id === "v2")?.forced).toBe(true);
  });

  it("only plan/target may follow now", () => {
    const d = validate("release v1\nnow\nissue X-1\nplan v2");
    expect(d).toEqual([expect.objectContaining({ code: "E-AFTER-NOW", line: 3 })]);
  });

  it("re-targeting keeps the former target", () => {
    const m = model(fixture("D-discard-retarget"));
    const b = m.branches.find((x) => x.id === "X-63");
    expect(b?.target).toBe("v3.2");
    expect(b?.previousTargets).toEqual(["v3.1"]);
  });

  it("unknown ids and duplicates are reported", () => {
    expect(codes("release v1\nstep X-9 done")).toContain("E-UNKNOWN-BRANCH");
    expect(codes("release v1\nrelease v1")).toContain("E-DUP-BASELINE");
    expect(codes("release v1\nissue X-1\nissue X-1")).toContain("E-DUP-BRANCH");
    expect(codes("release v1 on Z")).toContain("E-UNKNOWN-LINE");
    expect(codes("release v1\nnow\nplan v2\ntarget X-1 v2")).toContain("E-UNKNOWN-BRANCH");
  });

  it("line fork requires a released hardware baseline and relocates it to the child line", () => {
    const m = model(fixture("C-hardware-revision"));
    const rb = m.lines.find((l) => l.id === "RB");
    expect(rb).toMatchObject({ parent: "RA", forkBaseline: "RevB" });
    expect(m.baselines.find((b) => b.id === "RevB")?.line).toBe("RB");
    // X-118 forks from v1.4 on RA (RevB belongs to the child line).
    expect(m.branches.find((b) => b.id === "X-118")?.fork).toBe("v1.4");
    expect(codes("line A\nrelease v1\nline B from v1")).toContain("R5");
    expect(codes("line A\nrelease v1\nline B from v9")).toContain("R5");
  });

  it("warns when dates decrease", () => {
    expect(validate("release v1 @2026-05\nrelease v2 @2026-03")).toEqual([
      expect.objectContaining({ code: "W-DATE-ORDER", severity: "warning", line: 2 }),
    ]);
  });

  it("marks overdue planned baselines", () => {
    const m = model("release v1 @2026-05\nnow\nplan v2 @2026-04");
    expect(m.baselines.find((b) => b.id === "v2")?.overdue).toBe(true);
  });

  it("validates config values", () => {
    expect(codes("config theme = neon")).toContain("E-CONFIG");
    expect(codes("config colour = red")).toContain("W-CONFIG");
    expect(model("config showClosed = false\nconfig labels = ref").config).toMatchObject({ showClosed: false, labels: "ref" });
  });

  it("the first declared line stays current until 'use'", () => {
    const m = model("line A\nline B\nrelease v1\nuse B\nrelease s1");
    expect(m.baselines.map((b) => [b.id, b.line])).toEqual([["v1", "A"], ["s1", "B"]]);
  });

  it("diagnostics are sorted by position", () => {
    const d = validate("release v1\nissue X-1 from v9\nfoo\nstep Y done");
    const pos = d.map((x) => x.line * 1000 + x.col);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
  });
});
