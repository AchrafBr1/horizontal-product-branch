import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderSVG } from "@hpb/core";
import axe from "axe-core";
import { HpbDiagram } from "../src/index";
import { renderHpbToString } from "../src/server";

const fixture = (name: string) =>
  readFileSync(resolve(__dirname, `../../../examples/fixtures/${name}.hpb`), "utf8");

const A = fixture("A-firmware-line");

/** Serialises markup through the DOM so that "<x/>" and "<x></x>" compare equal. */
const norm = (html: string) => {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.innerHTML;
};

afterEach(cleanup);

describe("<HpbDiagram>", () => {
  it("renders the core SVG inside a wrapper div", () => {
    const { container } = render(<HpbDiagram code={A} className="mine" />);
    const div = container.firstElementChild as HTMLDivElement;
    expect(div.className).toBe("hpb-diagram mine");
    const svg = div.querySelector("svg")!;
    // Same markup as the core, with the per-instance id prefix from useId().
    expect(svg.id).toMatch(/^hpb[A-Za-z0-9-]+$/);
    expect(div.innerHTML).toBe(norm(renderSVG(A, { onError: "box", idPrefix: svg.id })));
    expect(svg.getAttribute("class")).toContain("hpb-theme-default");
    expect(svg.querySelectorAll('[data-hpb-kind="branch"]').length).toBeGreaterThan(0);
  });

  it("applies theme, showClosed and options", () => {
    const { container } = render(
      <HpbDiagram code={A} theme="dark" showClosed={false} options={{ idPrefix: "x1", colWidth: 60 }} />
    );
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("class")).toContain("hpb-theme-dark");
    expect(svg.id).toBe("x1");
    expect(container.firstElementChild!.innerHTML).toBe(
      norm(renderSVG(A, { theme: "dark", showClosed: false, idPrefix: "x1", colWidth: 60 }))
    );
  });

  it("is SSR-safe and hydrates without mismatch", () => {
    const html = renderToString(<HpbDiagram code={A} theme="mono" />);
    expect(html).toContain('class="hpb hpb-theme-mono"');
    const id = /<svg [^>]*id="([^"]+)"/.exec(html)![1];
    expect(html).toContain(renderSVG(A, { theme: "mono", idPrefix: id }));
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a) => errors.push(a));
    let root: ReturnType<typeof hydrateRoot> | undefined;
    act(() => {
      root = hydrateRoot(host, <HpbDiagram code={A} theme="mono" />, { onRecoverableError: (e) => errors.push(e) });
    });
    expect(errors).toEqual([]);
    spy.mockRestore();
    act(() => root!.unmount());
    host.remove();
  });

  it("dims other elements on hover and restores on leave", () => {
    const { container } = render(<HpbDiagram code={A} />);
    const branch = container.querySelector('g.hpb-branch[data-hpb-id="X-101"]')!;
    expect(branch).toBeTruthy();
    fireEvent.mouseOver(branch.firstElementChild ?? branch);
    const same = container.querySelectorAll<SVGElement>('[data-hpb-id="X-101"]');
    const others = Array.from(container.querySelectorAll<SVGElement>("[data-hpb-id]")).filter(
      (el) => el.getAttribute("data-hpb-id") !== "X-101"
    );
    same.forEach((el) => expect(el.style.opacity).toBe(""));
    expect(others.length).toBeGreaterThan(0);
    others.forEach((el) => expect(el.style.opacity).toBe("0.35"));
    fireEvent.mouseLeave(container.firstElementChild!);
    others.forEach((el) => expect(el.style.opacity).toBe(""));
  });

  it("does not dim when hoverDim is false", () => {
    const { container } = render(<HpbDiagram code={A} hoverDim={false} />);
    const branch = container.querySelector('g.hpb-branch[data-hpb-id="X-101"]')!;
    fireEvent.mouseOver(branch);
    container.querySelectorAll<SVGElement>("[data-hpb-id]").forEach((el) => expect(el.style.opacity).toBe(""));
  });

  it("reports clicks on branches and baselines", () => {
    const onNodeClick = vi.fn();
    const { container } = render(<HpbDiagram code={A} onNodeClick={onNodeClick} />);
    fireEvent.click(container.querySelector('g.hpb-branch[data-hpb-id="I-21"]')!.firstElementChild!);
    fireEvent.click(container.querySelector('g.hpb-baseline[data-hpb-id="v1.1"]')!);
    expect(onNodeClick).toHaveBeenNthCalledWith(1, { kind: "branch", id: "I-21" });
    expect(onNodeClick).toHaveBeenNthCalledWith(2, { kind: "baseline", id: "v1.1" });
    // clicking empty background does nothing
    fireEvent.click(container.querySelector("rect.hpb-bg")!);
    expect(onNodeClick).toHaveBeenCalledTimes(2);
  });

  it("makes nodes keyboard-activatable when clickable", () => {
    const onNodeClick = vi.fn();
    const { container } = render(<HpbDiagram code={A} onNodeClick={onNodeClick} />);
    const v = container.querySelector<SVGElement>('g.hpb-baseline[data-hpb-id="v1.0"]')!;
    expect(v.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(v, { key: "Enter" });
    expect(onNodeClick).toHaveBeenCalledWith({ kind: "baseline", id: "v1.0" });
  });

  it("uses the latest onNodeClick without re-rendering the SVG", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { container, rerender } = render(<HpbDiagram code={A} onNodeClick={first} />);
    const svgBefore = container.querySelector("svg");
    rerender(<HpbDiagram code={A} onNodeClick={second} />);
    expect(container.querySelector("svg")).toBe(svgBefore);
    fireEvent.click(container.querySelector('g.hpb-baseline[data-hpb-id="v1.1"]')!);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ kind: "baseline", id: "v1.1" });
  });

  it("shows the error box and calls onError on invalid source", () => {
    const onError = vi.fn();
    const bad = 'hpb "Bad"\nline A "A"\nrelease v1.0 merges NOPE\n';
    const { container } = render(<HpbDiagram code={bad} onError={onError} />);
    expect(container.querySelector("svg.hpb-error")).toBeTruthy();
    expect(container.firstElementChild!.className).toContain("hpb-diagram-error");
    expect(onError).toHaveBeenCalledTimes(1);
    const diags = onError.mock.calls[0][0];
    expect(diags.some((d: { severity: string }) => d.severity === "error")).toBe(true);
  });

  it("does not call onError for valid source", () => {
    const onError = vi.fn();
    render(<HpbDiagram code={A} onError={onError} />);
    expect(onError).not.toHaveBeenCalled();
  });

  it("onDiagnostics reports every render, including [] after a fix and warnings", () => {
    const onDiagnostics = vi.fn();
    const bad = "line A\nrelease v1 merges NOPE\n";
    const { rerender } = render(<HpbDiagram code={bad} onDiagnostics={onDiagnostics} />);
    expect(onDiagnostics.mock.calls.at(-1)![0].some((d: { severity: string }) => d.severity === "error")).toBe(true);
    rerender(<HpbDiagram code={A} onDiagnostics={onDiagnostics} />);
    expect(onDiagnostics.mock.calls.at(-1)![0]).toEqual([]);
    const warn = "line A\nrelease v1\nissue X-1\ndiscard X-1\n";
    rerender(<HpbDiagram code={warn} onDiagnostics={onDiagnostics} />);
    expect(onDiagnostics.mock.calls.at(-1)![0]).toEqual([expect.objectContaining({ code: "R2", severity: "warning" })]);
    rerender(<HpbDiagram code={A} theme={"drak" as never} onDiagnostics={onDiagnostics} />);
    expect(onDiagnostics.mock.calls.at(-1)![0]).toEqual([expect.objectContaining({ code: "E-OPTION" })]);
  });

  it("gives two diagrams with the same source distinct element ids", () => {
    const { container } = render(
      <>
        <HpbDiagram code={A} />
        <HpbDiagram code={A} />
      </>
    );
    const ids = Array.from(container.querySelectorAll("[id]")).map((el) => el.id);
    expect(ids.length).toBeGreaterThan(4);
    expect(new Set(ids).size).toBe(ids.length);
    // Same through the server renderer.
    const html = renderToString(
      <>
        <HpbDiagram code={A} />
        <HpbDiagram code={A} />
      </>
    );
    const serverIds = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(serverIds).size).toBe(serverIds.length);
    for (const svg of Array.from(container.querySelectorAll("svg"))) {
      for (const ref of (svg.getAttribute("aria-labelledby") ?? "").split(" ")) {
        expect(svg.querySelector(`#${ref}`)).toBeTruthy();
      }
    }
  });

  it("is accessible when interactive (axe) and exposes named buttons", async () => {
    const { container } = render(<HpbDiagram code={fixture("C-hardware-revision")} onNodeClick={() => {}} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("group");
    expect(svg.getAttribute("aria-roledescription")).toBe("HPB diagram");
    const focusable = container.querySelectorAll('[tabindex="0"]');
    expect(focusable.length).toBeGreaterThan(5);
    focusable.forEach((el) => {
      expect(el.getAttribute("role")).toBe("button");
      expect(el.getAttribute("aria-label")).toMatch(/\S/);
    });
    expect(container.querySelector('[data-hpb-id="X-118"][role="button"]')!.getAttribute("aria-label")).toContain(
      "X-118 Relay chatter"
    );
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  it("keeps role=img for the static (non-clickable) diagram and passes axe", async () => {
    const { container } = render(<HpbDiagram code={A} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(container.querySelector('[tabindex="0"]')).toBeNull();
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  it("forwards extra div attributes", () => {
    const { container } = render(<HpbDiagram code={A} id="d1" data-testid="hpb" style={{ border: "1px solid" }} />);
    const div = container.firstElementChild as HTMLDivElement;
    expect(div.id).toBe("d1");
    expect(div.getAttribute("data-testid")).toBe("hpb");
    expect(div.style.border).toBe("1px solid");
  });
});

describe("renderHpbToString (server)", () => {
  it("equals core renderSVG", () => {
    for (const name of ["A-firmware-line", "B-release-gate", "C-hardware-revision", "D-discard-retarget", "E-collapsed-history"]) {
      const src = fixture(name);
      expect(renderHpbToString(src, { theme: "mono" })).toBe(renderSVG(src, { theme: "mono" }));
      expect(renderHpbToString(src)).toMatch(/^<svg [^>]*class="hpb hpb-theme-default"/);
    }
  });

  it("throws with onError: throw", () => {
    expect(() => renderHpbToString("line A\nrelease v1 merges NOPE\n", { onError: "throw" })).toThrow(/HPB/);
  });
});
