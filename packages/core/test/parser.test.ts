import { describe, expect, it } from "vitest";
import { parse } from "../src";
import { FIXTURES, fixture } from "./helpers";

describe("parse", () => {
  it("parses every canonical example without diagnostics", () => {
    for (const name of FIXTURES) {
      const { diagnostics } = parse(fixture(name));
      expect(diagnostics, name).toEqual([]);
    }
  });

  it("reads the header title and statements in order", () => {
    const { ast } = parse(fixture("A-firmware-line"));
    expect(ast.title).toBe("Product A — firmware line");
    expect(ast.statements.map((s) => s.type)).toEqual([
      "header", "line", "release", "branch", "branch", "release", "branch", "branch", "release", "branch", "branch", "release",
    ]);
  });

  it("parses release with kind, date, merges, force and on in any order", () => {
    const { ast, diagnostics } = parse("release RevB @2026-06-15 hardware on RA force merges L-5, I-30");
    expect(diagnostics).toEqual([]);
    const s = ast.statements[0];
    expect(s).toMatchObject({
      type: "release",
      id: { value: "RevB" },
      kind: "hardware",
      date: { year: 2026, month: 6, day: 15 },
      force: true,
      on: { value: "RA" },
    });
    if (s.type === "release") expect(s.merges.map((m) => m.value)).toEqual(["L-5", "I-30"]);
  });

  it("accepts branch aliases and is case-insensitive", () => {
    const { ast, diagnostics } = parse('BUG X-1 "a"\nfeature I-1 "b"\nt T-1\nevolution L-1 "c" from v1 on A targets v2 @2026-01');
    expect(diagnostics).toEqual([]);
    expect(ast.statements.map((s) => (s.type === "branch" ? s.branchType : s.type))).toEqual(["issue", "improvement", "task", "lab"]);
    expect(ast.statements[3]).toMatchObject({ from: { value: "v1" }, on: { value: "A" }, target: { value: "v2" } });
  });

  it("ignores comments (# and %%), blank lines and indentation", () => {
    const { ast, diagnostics } = parse("# comment\n\n   %% another\n  release v1.0   # trailing\n\tnow %% x");
    expect(diagnostics).toEqual([]);
    expect(ast.statements.map((s) => s.type)).toEqual(["release", "now"]);
  });

  it("keeps # inside strings and supports escaped quotes", () => {
    const { ast } = parse('issue X-1 "Fix #42 \\"now\\""');
    expect(ast.statements[0]).toMatchObject({ title: 'Fix #42 "now"' });
  });

  it("parses step, merge, discard, target, eos, collapse, note and config", () => {
    const src = [
      "config showClosed = false",
      'step L-5 pass "EMC retest" @2026-02',
      "merge X-1 into v2 @2026-03",
      'discard I-60 "not viable"',
      "target I-61 v3.2",
      "eos RA @2026-12",
      "collapse v1.0 14",
      'note v1.0 "first release"',
    ].join("\n");
    const { ast, diagnostics } = parse(src);
    expect(diagnostics).toEqual([]);
    expect(ast.statements.map((s) => s.type)).toEqual(["config", "step", "merge", "discard", "target", "eos", "collapse", "note"]);
    expect(ast.statements[6]).toMatchObject({ count: 14 });
  });

  it("reports syntax errors with line and column", () => {
    const { diagnostics } = parse('release v1.0\nrelase v1.1\nissue X-1 "open string\nstep X-1 maybe\nrelease v2 @2026-13\nissue X$2');
    const at = diagnostics.map((d) => [d.code, d.line, d.col]);
    expect(at).toContainEqual(["E-SYNTAX", 2, 1]);
    expect(diagnostics.find((d) => d.line === 2)?.message).toMatch(/Did you mean 'release'/);
    expect(at).toContainEqual(["E-SYNTAX", 3, 11]);
    expect(at).toContainEqual(["R6", 4, 10]);
    expect(at).toContainEqual(["E-DATE", 5, 12]);
    expect(at).toContainEqual(["E-SYNTAX", 6, 8]);
    for (const d of diagnostics) expect(d.severity).toBe("error");
  });

  it("reports unexpected trailing tokens", () => {
    const { diagnostics } = parse("now later");
    expect(diagnostics[0]).toMatchObject({ code: "E-SYNTAX", line: 1, col: 5 });
  });

  it("never throws on arbitrary input", () => {
    for (const input of ["", "\u0000\u0001", '"""', "@@@", "release", "merge X", "collapse v1 x", ",,,=", "\r\n\r\n", "hpb", "line"]) {
      expect(() => parse(input)).not.toThrow();
    }
  });
});
