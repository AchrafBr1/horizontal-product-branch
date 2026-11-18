import { describe, expect, it, vi } from "vitest";
import { renderSVG } from "@hpb/core";
import axe from "axe-core";
import { attachInteraction } from "../src/interaction";
import { fixture } from "./helpers";

function mount(code = fixture("A")): HTMLDivElement {
  const div = document.createElement("div");
  div.innerHTML = renderSVG(code);
  document.body.append(div);
  return div;
}

const opacityOf = (root: ParentNode, id: string) =>
  Array.from(root.querySelectorAll<SVGElement>(`[data-hpb-id="${id}"]`)).map((e) => e.style.opacity);

describe("attachInteraction", () => {
  it("dims every other node to 35% on hover and restores on leave", () => {
    const div = mount();
    const detach = attachInteraction(div);
    const hovered = div.querySelector<SVGElement>('g.hpb-branch[data-hpb-id="I-21"]')!;
    expect(hovered).toBeTruthy();
    hovered.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(opacityOf(div, "I-21").every((o) => o === "")).toBe(true);
    expect(opacityOf(div, "X-101").length).toBeGreaterThan(0);
    expect(opacityOf(div, "X-101").every((o) => o === "0.35")).toBe(true);
    expect(opacityOf(div, "v1.1").every((o) => o === "0.35")).toBe(true);

    hovered.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
    for (const el of Array.from(div.querySelectorAll<SVGElement>("[data-hpb-id]"))) expect(el.style.opacity).toBe("");
    detach();
  });

  it("reports clicks with the raw kind and id", () => {
    const div = mount();
    const onNodeClick = vi.fn();
    const detach = attachInteraction(div, { onNodeClick });
    div.querySelector('g.hpb-baseline[data-hpb-id="v1.0.1"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    div.querySelector('g.hpb-branch[data-hpb-id="T-8"] *')!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onNodeClick.mock.calls.map((c) => c[0])).toEqual([
      { kind: "baseline", id: "v1.0.1" },
      { kind: "branch", id: "T-8" },
    ]);
    detach();
  });

  it("makes nodes keyboard focusable and activates them with Enter", () => {
    const div = mount();
    const onNodeClick = vi.fn();
    const detach = attachInteraction(div, { onNodeClick });
    const node = div.querySelector('g.hpb-branch[data-hpb-id="I-22"]')!;
    expect(node.getAttribute("tabindex")).toBe("0");
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onNodeClick).toHaveBeenCalledWith({ kind: "branch", id: "I-22" }, expect.anything());
    detach();
    expect(node.getAttribute("tabindex")).toBe("-1");
  });

  it("switches to an operable structure (group + named buttons) and restores it", async () => {
    const div = mount(fixture("C"));
    const svg = div.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    const detach = attachInteraction(div, { onNodeClick: () => {} });
    expect(svg.getAttribute("role")).toBe("group");
    expect(svg.getAttribute("aria-roledescription")).toBe("HPB diagram");
    const buttons = div.querySelectorAll('[tabindex="0"]');
    expect(buttons.length).toBeGreaterThan(5);
    buttons.forEach((b) => {
      expect(b.getAttribute("role")).toBe("button");
      expect((b.getAttribute("aria-label") ?? "").length).toBeGreaterThan(2);
    });
    expect(div.querySelector('[data-hpb-id="RevB"][role="button"]')!.getAttribute("aria-label")).toContain("hardware baseline");
    const result = await axe.run(div, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    detach();
    expect(svg.getAttribute("role")).toBe("img");
    expect(div.querySelector("[role=button]")).toBeNull();
    div.remove();
  });

  it("detach removes listeners", () => {
    const div = mount();
    const onNodeClick = vi.fn();
    attachInteraction(div, { onNodeClick })();
    div.querySelector("g.hpb-branch")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onNodeClick).not.toHaveBeenCalled();
  });
});
