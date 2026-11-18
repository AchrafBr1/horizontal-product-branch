import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fixture, tick } from "./helpers";

const bundle = join(dirname(fileURLToPath(import.meta.url)), "../dist/hpb.min.js");

// Runs after `pnpm build` (dist/ is not committed).
describe.skipIf(!existsSync(bundle))("dist/hpb.min.js (<script> bundle)", () => {
  it("exposes window.HPB, registers <hpb-diagram> and auto-renders on load", async () => {
    document.body.innerHTML = `<pre class="hpb">${fixture("A")}</pre><hpb-diagram theme="mono">${fixture("B")}</hpb-diagram>`;
    new Function(readFileSync(bundle, "utf8"))();
    const HPB = (window as unknown as { HPB: Record<string, unknown> }).HPB;
    expect(typeof HPB.initialize).toBe("function");
    expect(typeof HPB.run).toBe("function");
    expect(typeof HPB.render).toBe("function");
    expect(HPB.version).toBe("1.0.0");
    expect(customElements.get("hpb-diagram")).toBeTruthy();
    await tick(5);
    expect(document.querySelector("pre.hpb svg.hpb")).toBeTruthy();
    const el = document.querySelector("hpb-diagram")!;
    expect(el.shadowRoot!.querySelector("svg.hpb-theme-mono")).toBeTruthy();
  });
});
