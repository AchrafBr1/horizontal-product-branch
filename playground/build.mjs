// Refreshes the inlined examples of playground/index.html from examples/fixtures/*.hpb and
// writes playground/dist/index.html: a single self-contained file with hpb.min.js inlined
// (host it anywhere, or open it from disk).
//
//   node playground/build.mjs        (run after `pnpm --filter @hpb/web build`)
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "examples", "fixtures");
const pagePath = join(here, "index.html");
const bundlePath = join(here, "..", "packages", "web", "dist", "hpb.min.js");

const names = {
  A: "A — Firmware line",
  B: "B — Release gate",
  C: "C — Hardware revision",
  D: "D — Discard and re-target",
  E: "E — Collapsed history",
};

const attr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const blocks = readdirSync(fixturesDir)
  .filter((f) => f.endsWith(".hpb"))
  .sort()
  .map((f) => {
    const key = f.split("-")[0];
    const fallback = f.replace(/\.hpb$/, "").replace(/^[A-Z]-/, "").replace(/-/g, " ");
    const name = names[key] ?? `${key} — ${fallback}`;
    const code = readFileSync(join(fixturesDir, f), "utf8").replace(/\r\n?/g, "\n").replace(/<\/script/gi, "<\\/script");
    return `<script type="text/plain" data-example="${attr(key)}" data-name="${attr(name)}">${code.endsWith("\n") ? code : code + "\n"}</script>`;
  });

let page = readFileSync(pagePath, "utf8");
const start = "<!-- fixtures:start -->";
const end = "<!-- fixtures:end -->";
const a = page.indexOf(start);
const b = page.indexOf(end);
if (a < 0 || b < a) throw new Error("fixture markers not found in playground/index.html");
page = page.slice(0, a + start.length) + "\n" + blocks.join("\n") + "\n" + page.slice(b);
writeFileSync(pagePath, page);
console.log(`playground/index.html: ${blocks.length} examples inlined`);

if (!existsSync(bundlePath)) {
  console.warn("packages/web/dist/hpb.min.js not found: run `pnpm --filter @hpb/web build` to also write playground/dist/index.html");
} else {
  const bundle = readFileSync(bundlePath, "utf8")
    .replace(/\n\/\/# sourceMappingURL=.*$/m, "")
    .replace(/<\/script/gi, "<\\/script");
  const tag = '<script src="../packages/web/dist/hpb.min.js"></script>';
  if (!page.includes(tag)) throw new Error("bundle <script> tag not found in playground/index.html");
  const standalone = page.replace(tag, () => `<script>${bundle}</script>`);
  mkdirSync(join(here, "dist"), { recursive: true });
  writeFileSync(join(here, "dist", "index.html"), standalone);
  console.log(`playground/dist/index.html: standalone (${Math.round(standalone.length / 1024)} KB)`);
}
