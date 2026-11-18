import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { defineHpbElement } from "../src/element";
import type { HpbDiagramElement } from "../src/element";
import { fixture, tick } from "./helpers";

beforeAll(() => defineHpbElement());
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

async function make(html: string): Promise<HpbDiagramElement> {
  document.body.innerHTML = html;
  await tick();
  return document.querySelector("hpb-diagram")!;
}
const svgOf = (el: HpbDiagramElement) => el.shadowRoot!.querySelector("svg")!;

describe("<hpb-diagram>", () => {
  it("is registered and defineHpbElement is idempotent", () => {
    expect(customElements.get("hpb-diagram")).toBeTruthy();
    expect(() => defineHpbElement()).not.toThrow();
  });

  it("renders its text content into a shadow root", async () => {
    const el = await make(`<hpb-diagram>${fixture("A")}</hpb-diagram>`);
    expect(el.shadowRoot).toBeTruthy();
    const svg = svgOf(el);
    expect(svg.getAttribute("class")).toContain("hpb-theme-default");
    // Interactive by default: an operable group of named buttons (role="img" would hide them).
    expect(svg.getAttribute("role")).toBe("group");
    expect(el.svg).toContain("<svg");
    const still = await make(`<hpb-diagram no-interaction>${fixture("A")}</hpb-diagram>`);
    expect(svgOf(still).getAttribute("role")).toBe("img");
    const auto = await make(`<hpb-diagram theme="auto">${fixture("A")}</hpb-diagram>`);
    expect(svgOf(auto).getAttribute("class")).toContain("hpb-theme-auto");
    expect(auto.svg).toContain("prefers-color-scheme: dark");
    expect(el.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });

  it("re-renders when theme / show-closed attributes change", async () => {
    const el = await make(`<hpb-diagram theme="mono">${fixture("A")}</hpb-diagram>`);
    expect(svgOf(el).getAttribute("class")).toContain("hpb-theme-mono");
    const before = el.shadowRoot!.querySelectorAll("g.hpb-branch").length;
    el.setAttribute("theme", "dark");
    el.setAttribute("show-closed", "false");
    await tick();
    expect(svgOf(el).getAttribute("class")).toContain("hpb-theme-dark");
    expect(el.shadowRoot!.querySelectorAll("g.hpb-branch").length).toBeLessThan(before);
  });

  it("re-renders when its text content changes", async () => {
    const el = await make(`<hpb-diagram>${fixture("A")}</hpb-diagram>`);
    el.textContent = fixture("B");
    await tick();
    expect(el.shadowRoot!.querySelector('[data-hpb-id="v2.1"]')).toBeTruthy();
  });

  it("the code property wins over the text content", async () => {
    const el = await make(`<hpb-diagram>${fixture("A")}</hpb-diagram>`);
    const onRender = vi.fn();
    el.addEventListener("hpb-render", onRender);
    el.code = fixture("D");
    await tick();
    expect(el.shadowRoot!.querySelector('[data-hpb-id="I-60"]')).toBeTruthy();
    expect(onRender).toHaveBeenCalledTimes(1);
  });

  it("dispatches a composed hpb-node-click event", async () => {
    const el = await make(`<hpb-diagram>${fixture("A")}</hpb-diagram>`);
    const got: unknown[] = [];
    const listener = (e: Event) => got.push((e as CustomEvent).detail);
    document.addEventListener("hpb-node-click", listener);
    el.shadowRoot!.querySelector('g.hpb-baseline[data-hpb-id="v1.2"]')!.dispatchEvent(
      new MouseEvent("click", { bubbles: true, composed: true })
    );
    document.removeEventListener("hpb-node-click", listener);
    expect(got).toEqual([{ kind: "baseline", id: "v1.2" }]);
  });

  it("dims the other branches on hover", async () => {
    const el = await make(`<hpb-diagram>${fixture("A")}</hpb-diagram>`);
    el.shadowRoot!.querySelector('g.hpb-branch[data-hpb-id="X-102"]')!.dispatchEvent(
      new MouseEvent("mouseover", { bubbles: true })
    );
    const other = el.shadowRoot!.querySelector<SVGElement>('g.hpb-branch[data-hpb-id="I-22"]')!;
    const same = el.shadowRoot!.querySelector<SVGElement>('g.hpb-branch[data-hpb-id="X-102"]')!;
    expect(other.style.opacity).toBe("0.35");
    expect(same.style.opacity).toBe("");
  });

  it("loads the source from src", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => fixture("C") });
    vi.stubGlobal("fetch", fetchMock);
    const el = await make(`<hpb-diagram src="c.hpb"></hpb-diagram>`);
    await tick(5);
    expect(fetchMock).toHaveBeenCalledWith("c.hpb");
    expect(el.shadowRoot!.querySelector('[data-hpb-id="RevB"]')).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("fires hpb-error when src cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "" }));
    const onError = vi.fn();
    document.addEventListener("hpb-error", onError, { once: true });
    const el = await make(`<hpb-diagram src="missing.hpb"></hpb-diagram>`);
    await tick(5);
    expect(onError).toHaveBeenCalled();
    expect(el.shadowRoot!.textContent).toContain("Could not load missing.hpb");
    vi.unstubAllGlobals();
  });

  it("shows the error box for invalid sources", async () => {
    const el = await make(`<hpb-diagram>release</hpb-diagram>`);
    expect(el.shadowRoot!.querySelector("svg.hpb-error")).toBeTruthy();
    expect(el.diagnostics.some((d) => d.severity === "error")).toBe(true);
  });
});
