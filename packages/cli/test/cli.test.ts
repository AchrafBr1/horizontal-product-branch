import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXIT_DIAGNOSTICS, EXIT_OK, EXIT_USAGE, formatDiagnostic, run, type CliIO } from "../src/index";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(here, "../../core/test/fixtures");
const fixture = (name: string) => fs.readFileSync(path.join(FIXTURES, `${name}.hpb`), "utf8");

interface FakeIO extends CliIO {
  out: string;
  err: string;
  written: Map<string, string>;
}

function fakeIO(files: Record<string, string> = {}, stdin = ""): FakeIO {
  const io: FakeIO = {
    out: "",
    err: "",
    written: new Map(),
    color: false,
    readFile(file) {
      if (file in files) return files[file];
      const e = new Error(`ENOENT: no such file '${file}'`) as NodeJS.ErrnoException;
      e.code = "ENOENT";
      throw e;
    },
    writeFile(file, content) {
      io.written.set(file, content);
    },
    readStdin: () => Promise.resolve(stdin),
    stdout(t) {
      io.out += t;
    },
    stderr(t) {
      io.err += t;
    },
  };
  return io;
}

const BAD = `line A "Product A"
release v1.0
issue X-1 "Bug"
release v1.1
merge X-1 into v1.0
`;

describe("hpb render", () => {
  it("writes the SVG to stdout by default", async () => {
    const io = fakeIO({ "a.hpb": fixture("A-firmware-line") });
    const code = await run(["render", "a.hpb"], io);
    expect(code).toBe(EXIT_OK);
    expect(io.out.startsWith("<svg")).toBe(true);
    expect(io.out).toContain('class="hpb hpb-theme-default"');
    expect(io.err).toBe("");
  });

  it("writes to -o and honours --theme", async () => {
    const io = fakeIO({ "b.hpb": fixture("B-release-gate") });
    const code = await run(["render", "b.hpb", "-o", "out/b.svg", "--theme", "mono"], io);
    expect(code).toBe(EXIT_OK);
    const svg = io.written.get("out/b.svg") ?? "";
    expect(svg).toContain("hpb-theme-mono");
    expect(io.out).toBe("");
    expect(io.err).toContain("Wrote out/b.svg");
  });

  it("accepts --option=value and --show-closed overrides config showClosed = false", async () => {
    const src = fixture("A-firmware-line").replace("line A", "config showClosed = false\nline A");
    const hidden = fakeIO({ "e.hpb": src });
    await run(["render", "e.hpb", "--theme=dark"], hidden);
    const shown = fakeIO({ "e.hpb": src });
    await run(["render", "e.hpb", "--theme=dark", "--show-closed"], shown);
    expect(hidden.out).toContain("hpb-theme-dark");
    expect(shown.out).not.toBe(hidden.out);
  });

  it("reads standard input when the input is '-'", async () => {
    const io = fakeIO({}, fixture("C-hardware-revision"));
    const code = await run(["render", "-"], io);
    expect(code).toBe(EXIT_OK);
    expect(io.out).toContain("<svg");
  });

  it("is deterministic", async () => {
    const a = fakeIO({ "d.hpb": fixture("D-discard-retarget") });
    const b = fakeIO({ "d.hpb": fixture("D-discard-retarget") });
    await run(["render", "d.hpb"], a);
    await run(["render", "d.hpb"], b);
    expect(a.out).toBe(b.out);
  });

  it("refuses to write an SVG when the source has errors", async () => {
    const io = fakeIO({ "bad.hpb": BAD });
    const code = await run(["render", "bad.hpb", "-o", "bad.svg"], io);
    expect(code).toBe(EXIT_DIAGNOSTICS);
    expect(io.written.size).toBe(0);
    expect(io.err).toMatch(/^bad\.hpb:5:\d+: error \[(R3|E-MERGE-PAST)\]/m);
    expect(io.err).toContain("no SVG written");
  });

  it("--error-box writes the error-box SVG but still fails", async () => {
    const io = fakeIO({ "bad.hpb": BAD });
    const code = await run(["render", "bad.hpb", "--error-box"], io);
    expect(code).toBe(EXIT_DIAGNOSTICS);
    expect(io.out).toContain("hpb-error");
  });

  it("reports usage errors with exit code 2", async () => {
    expect(await run(["render"], fakeIO())).toBe(EXIT_USAGE);
    expect(await run(["render", "x.hpb", "--theme", "neon"], fakeIO({ "x.hpb": "" }))).toBe(EXIT_USAGE);
    expect(await run(["render", "x.hpb", "--bogus"], fakeIO({ "x.hpb": "" }))).toBe(EXIT_USAGE);
    expect(await run(["render", "x.hpb", "--col-width", "abc"], fakeIO({ "x.hpb": "" }))).toBe(EXIT_USAGE);
    const io = fakeIO();
    expect(await run(["render", "missing.hpb"], io)).toBe(EXIT_USAGE);
    expect(io.err).toContain("File not found: missing.hpb");
    expect(await run(["frobnicate"], fakeIO())).toBe(EXIT_USAGE);
  });
});

describe("hpb validate", () => {
  it("passes the canonical examples", async () => {
    const files: Record<string, string> = {};
    for (const n of ["A-firmware-line", "B-release-gate", "C-hardware-revision", "D-discard-retarget", "E-collapsed-history"]) {
      files[`${n}.hpb`] = fixture(n);
    }
    const io = fakeIO(files);
    const code = await run(["validate", ...Object.keys(files)], io);
    expect(code).toBe(EXIT_OK);
    expect(io.err).toContain("OK: 5 files valid.");
  });

  it("prints file:line:col diagnostics and fails on errors", async () => {
    const io = fakeIO({ "bad.hpb": BAD });
    const code = await run(["validate", "bad.hpb"], io);
    expect(code).toBe(EXIT_DIAGNOSTICS);
    expect(io.out).toMatch(/^bad\.hpb:5:\d+: error \[/m);
    expect(io.out).toContain("merge X-1 into v1.0"); // source excerpt
    expect(io.err).toMatch(/1 error/);
  });

  it("reports syntax errors with the right column", async () => {
    const io = fakeIO({ "s.hpb": 'line A "A"\nrelase v1.0\n' });
    const code = await run(["validate", "s.hpb"], io);
    expect(code).toBe(EXIT_DIAGNOSTICS);
    expect(io.out).toContain("s.hpb:2:1: error [E-SYNTAX] Unknown statement 'relase'. Did you mean 'release'?");
  });

  it("warnings do not fail unless --strict", async () => {
    const src = 'line A "A"\nrelease v1.0 @2026-05\nrelease v1.1 @2026-01\n';
    expect(await run(["validate", "w.hpb"], fakeIO({ "w.hpb": src }))).toBe(EXIT_OK);
    const io = fakeIO({ "w.hpb": src });
    expect(await run(["validate", "w.hpb", "--strict"], io)).toBe(EXIT_DIAGNOSTICS);
    expect(io.out).toContain("warning [W-DATE-ORDER]");
  });

  it("supports --format json and stdin", async () => {
    const io = fakeIO({}, BAD);
    const code = await run(["validate", "-", "--format", "json"], io);
    expect(code).toBe(EXIT_DIAGNOSTICS);
    const data = JSON.parse(io.out) as Array<{ file: string; diagnostics: Array<{ severity: string; line: number }> }>;
    expect(data[0].file).toBe("<stdin>");
    expect(data[0].diagnostics.some((d) => d.severity === "error" && d.line === 5)).toBe(true);
  });
});

describe("misc", () => {
  it("prints help and version", async () => {
    const io = fakeIO();
    expect(await run(["--help"], io)).toBe(EXIT_OK);
    expect(io.out).toContain("hpb render <input.hpb|->");
    const v = fakeIO();
    expect(await run(["--version"], v)).toBe(EXIT_OK);
    expect(v.out.trim()).toBe("1.0.0");
  });

  it("caps the output for a file that is not HPB Markup", async () => {
    const ts = Array.from({ length: 300 }, (_, i) => `export const v${i} = { a: [${i}] };`).join("\n");
    const io = fakeIO({ "x.ts": ts });
    expect(await run(["validate", "x.ts"], io)).toBe(EXIT_DIAGNOSTICS);
    const lines = io.out.split("\n").filter((l) => /^x\.ts:\d+:\d+: /.test(l));
    expect(lines.length).toBe(50);
    expect(lines[0]).toContain("[E-NOT-HPB]");
    expect(lines[0]).toContain("Is this an HPB Markup file?");
    expect(io.out).toMatch(/\.\.\. and 251 more diagnostics/);
    const all = fakeIO({ "x.ts": ts });
    await run(["validate", "x.ts", "--max", "0"], all);
    expect(all.out.split("\n").filter((l) => /^x\.ts:\d+:\d+: /.test(l)).length).toBe(301);
    expect(await run(["validate", "x.ts", "--max", "-1"], fakeIO({ "x.ts": ts }))).toBe(EXIT_USAGE);
  });

  it("renders the auto theme (light and dark in one SVG)", async () => {
    const io = fakeIO({ "a.hpb": fixture("A-firmware-line") });
    expect(await run(["render", "a.hpb", "--theme", "auto"], io)).toBe(EXIT_OK);
    expect(io.out).toContain("hpb-theme-auto");
    expect(io.out).toContain("@media (prefers-color-scheme: dark)");
  });

  it("formats diagnostics like compilers do", () => {
    expect(formatDiagnostic("f.hpb", { severity: "error", code: "R1", message: "msg", line: 3, col: 7 })).toBe(
      "f.hpb:3:7: error [R1] msg"
    );
  });

  it("the built executable runs (when built)", () => {
    const bin = path.resolve(here, "../dist/cli.js");
    const coreDist = path.resolve(here, "../../core/dist/index.js");
    if (!fs.existsSync(bin) || !fs.existsSync(coreDist)) return;
    const ok = spawnSync(process.execPath, [bin, "render", "-"], { input: fixture("A-firmware-line"), encoding: "utf8" });
    expect(ok.status).toBe(0);
    expect(ok.stdout.startsWith("<svg")).toBe(true);
    const bad = spawnSync(process.execPath, [bin, "validate", "-"], { input: BAD, encoding: "utf8" });
    expect(bad.status).toBe(1);
    expect(bad.stdout).toMatch(/<stdin>:5:\d+: error/);
  });
});
