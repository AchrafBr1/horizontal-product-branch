import { afterEach, describe, expect, it, vi } from "vitest";
import { HPB, formatDiagnostics, initialize, render, renderSync, resetConfig, run, runSync } from "../src/index";
import { fixture, tick } from "./helpers";

afterEach(() => {
  document.body.innerHTML = "";
  resetConfig();
  vi.restoreAllMocks();
});

describe("HPB.renderSync", () => {
  it("returns an SVG string using the id as prefix", () => {
    const svg = renderSync("diag1", fixture("A"));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('id="diag1"');
    expect(svg).toContain("hpb-theme-default");
  });

  it("applies the configured theme, overridable per call", () => {
    initialize({ startOnLoad: false, theme: "mono" });
    expect(renderSync("a", fixture("B"))).toContain("hpb-theme-mono");
    expect(renderSync("b", fixture("B"), { theme: "dark" })).toContain("hpb-theme-dark");
  });

  it("returns the error box for invalid input", () => {
    expect(renderSync("e", "release")).toContain("hpb-error");
  });
});

describe("HPB.runSync", () => {
  it("renders pre.hpb, code.language-hpb and .hpb blocks once", () => {
    document.body.innerHTML = `
      <pre class="hpb">${fixture("A")}</pre>
      <pre><code class="language-hpb">${fixture("B")}</code></pre>
      <div class="hpb">${fixture("D")}</div>
      <pre class="other">not hpb</pre>`;
    initialize({ startOnLoad: false });
    const results = runSync();
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.diagnostics.every((d) => d.severity !== "error"))).toBe(true);
    expect(document.querySelectorAll("svg.hpb")).toHaveLength(3);
    expect(results[1].element.tagName).toBe("PRE");
    expect(document.querySelectorAll("[data-hpb-processed]")).toHaveLength(3);
    const ids = Array.from(document.querySelectorAll("svg.hpb")).map((s) => s.id);
    expect(new Set(ids).size).toBe(3);
    // A second run does nothing: the rendered <svg class="hpb"> is not picked up again.
    expect(runSync()).toHaveLength(0);
    expect(document.querySelector("pre.other")!.textContent).toBe("not hpb");
  });

  it("re-renders with force after a theme change and honours data-* options", () => {
    document.body.innerHTML = `<pre class="hpb" id="p1">${fixture("A")}</pre><pre class="hpb" data-theme="dark">${fixture("C")}</pre>`;
    initialize({ startOnLoad: false });
    runSync();
    const [a, c] = Array.from(document.querySelectorAll("svg.hpb"));
    expect(a.id).toBe("p1-hpb");
    expect(a.getAttribute("class")).toContain("hpb-theme-default");
    expect(c.getAttribute("class")).toContain("hpb-theme-dark");
    initialize({ theme: "mono" });
    runSync({ force: true });
    expect(document.querySelector("#p1 svg")!.getAttribute("class")).toContain("hpb-theme-mono");
  });

  it("shows an error box, flags the block and logs diagnostics", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    document.body.innerHTML = `<pre class="hpb">line A\nmerge X-9 into v1</pre>`;
    initialize({ startOnLoad: false });
    const [r] = runSync();
    expect(r.diagnostics.some((d) => d.severity === "error")).toBe(true);
    expect(r.element.getAttribute("data-hpb-error")).toBe("true");
    expect(r.element.querySelector("svg.hpb-error")).toBeTruthy();
    expect(err).toHaveBeenCalled();
  });

  it("throws an HpbError with onError: throw (after rendering every block)", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    document.body.innerHTML = `<pre class="hpb">release</pre><pre class="hpb">${fixture("A")}</pre>`;
    initialize({ startOnLoad: false, onError: "throw" });
    expect(() => runSync()).toThrow(HPB.HpbError);
    expect(document.querySelectorAll("svg.hpb:not(.hpb-error)")).toHaveLength(1);
  });

  it("uses a custom selector and explicit nodes", () => {
    document.body.innerHTML = `<div class="diagram">${fixture("A")}</div><div class="x">${fixture("B")}</div>`;
    initialize({ startOnLoad: false, selector: ".diagram" });
    expect(runSync()).toHaveLength(1);
    expect(runSync({ nodes: [document.querySelector(".x")!] })).toHaveLength(1);
  });

  it("dispatches hpb-node-click and calls onNodeClick", () => {
    const onNodeClick = vi.fn();
    document.body.innerHTML = `<pre class="hpb">${fixture("A")}</pre>`;
    initialize({ startOnLoad: false, onNodeClick });
    runSync();
    const listener = vi.fn();
    document.body.addEventListener("hpb-node-click", (e) => listener((e as CustomEvent).detail));
    document.querySelector('g.hpb-branch[data-hpb-id="X-101"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(listener).toHaveBeenCalledWith({ kind: "branch", id: "X-101" });
    expect(onNodeClick).toHaveBeenCalledWith({ kind: "branch", id: "X-101" }, document.querySelector("pre"));
  });

  it("startOnLoad renders automatically once the DOM is ready", async () => {
    document.body.innerHTML = `<pre class="hpb">${fixture("E")}</pre>`;
    initialize({ startOnLoad: true });
    expect(document.querySelector("svg.hpb")).toBeNull();
    await tick(5);
    expect(document.querySelector("svg.hpb")).toBeTruthy();
  });

  it("initialize({startOnLoad:false}) right after cancels the pending auto-render", async () => {
    document.body.innerHTML = `<pre class="hpb">${fixture("E")}</pre>`;
    initialize({ startOnLoad: true });
    initialize({ startOnLoad: false });
    await tick(5);
    expect(document.querySelector("svg.hpb")).toBeNull();
  });
});

describe("Mermaid-compatible async API", () => {
  it("render(id, code) resolves with { svg, diagnostics, bindFunctions }", async () => {
    const { svg, diagnostics, bindFunctions } = await render("m1", fixture("A"));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('id="m1"');
    expect(diagnostics).toEqual([]);
    const host = document.createElement("div");
    host.innerHTML = svg;
    document.body.append(host);
    const onNodeClick = vi.fn();
    initialize({ startOnLoad: false, onNodeClick });
    bindFunctions!(host);
    host.querySelector('g.hpb-baseline[data-hpb-id="v1.1"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onNodeClick).toHaveBeenCalledWith({ kind: "baseline", id: "v1.1" }, host);
    expect(await HPB.render("m2", "release")).toMatchObject({ svg: expect.stringContaining("hpb-error") });
  });

  it("run() resolves with the results and rejects with onError: throw", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    document.body.innerHTML = `<pre class="hpb">${fixture("A")}</pre>`;
    initialize({ startOnLoad: false });
    const p = HPB.run();
    expect(p).toBeInstanceOf(Promise);
    expect(await p).toHaveLength(1);
    document.body.innerHTML = `<pre class="hpb">release</pre>`;
    initialize({ onError: "throw" });
    await expect(HPB.run()).rejects.toBeInstanceOf(HPB.HpbError);
  });

  it("warns once about bad options (e.g. a theme typo)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await render("t1", fixture("A"), { theme: "drak" as never });
    expect(out.diagnostics).toEqual([expect.objectContaining({ code: "E-OPTION", severity: "warning" })]);
    expect(out.diagnostics[0].message).toMatch(/Did you mean 'dark'/);
    await render("t2", fixture("A"), { theme: "drak" as never });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("caps the logged diagnostics of a non-HPB block", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const junk = Array.from({ length: 400 }, (_, i) => `const x${i} = { a: [${i}] };`).join("\n");
    document.body.innerHTML = `<pre class="hpb"></pre>`;
    document.querySelector("pre")!.textContent = junk;
    initialize({ startOnLoad: false });
    const [r] = runSync();
    // One syntax error per line at most, plus the "Is this an HPB Markup file?" hint.
    expect(r.diagnostics.length).toBeLessThanOrEqual(401);
    expect(r.diagnostics[0].code).toBe("E-NOT-HPB");
    const logged = String(err.mock.calls[0][0]);
    expect(logged.split("\n").length).toBeLessThanOrEqual(52);
    expect(logged).toMatch(/\.\.\. and \d+ more/);
    expect(formatDiagnostics([])).toBe("");
  });
});
