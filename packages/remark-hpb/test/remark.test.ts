import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import { renderSVG } from "@hpb/core";
import remarkHpb, { markdownItHpb, type RemarkHpbOptions } from "../src/index";
import markdownItDefault from "../src/markdown-it";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  fs.readFileSync(path.resolve(here, "../../core/test/fixtures", `${name}.hpb`), "utf8");

const A = fixture("A-firmware-line");
const doc = (body: string, lang = "hpb") => `# Release history\n\nSome text.\n\n\`\`\`${lang}\n${body}\`\`\`\n\nAfter.\n`;

async function toHtml(markdown: string, options?: RemarkHpbOptions) {
  const file = await unified()
    .use(remarkParse)
    .use(remarkHpb, options)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStringify)
    .process(markdown);
  return { html: String(file), messages: file.messages };
}

describe("remarkHpb", () => {
  it("replaces ```hpb fences with an inline SVG wrapped in div.hpb-diagram", async () => {
    const { html, messages } = await toHtml(doc(A));
    expect(html).toContain("<h1>Release history</h1>");
    expect(html).toContain('<div class="hpb-diagram"><svg');
    expect(html).toContain("hpb-theme-default");
    expect(html).not.toContain("<code");
    expect(html).toContain("<p>After.</p>");
    expect(messages).toHaveLength(0);
  });

  it("keeps other code blocks untouched", async () => {
    const { html } = await toHtml(doc("const x = 1;\n", "js"));
    expect(html).toContain('<code class="language-js">');
    expect(html).not.toContain("<svg");
  });

  it("passes render options and supports custom languages and a bare SVG", async () => {
    const { html } = await toHtml(doc(A, "hpb-diagram"), { languages: ["hpb-diagram"], theme: "mono", className: false });
    expect(html).toContain("hpb-theme-mono");
    expect(html).not.toContain("hpb-diagram\"");
  });

  it("produces the same SVG as @hpb/core (raw mdast output)", () => {
    const tree = {
      type: "root",
      children: [{ type: "code", lang: "hpb", value: A }],
    };
    remarkHpb({ className: false })(tree);
    expect(tree.children[0]).toEqual({ type: "html", value: renderSVG(A) });
  });

  it("gives unique ids to identical diagrams in one document", async () => {
    const { html } = await toHtml(doc(A) + "\n" + doc(A));
    const ids = [...html.matchAll(/<svg[^>]* id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    const prefixed = await toHtml(doc(A) + "\n" + doc(A), { idPrefix: "fig" });
    const ids2 = [...prefixed.html.matchAll(/<svg[^>]* id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids2).toEqual(["fig-1", "fig-2"]);
  });

  it("reports diagnostics as vfile messages at the Markdown line and draws the error box", async () => {
    const bad = 'line A "A"\nrelease v1.0\nissue X-1 "Bug"\nrelase v1.1\n';
    const { html, messages } = await toHtml(doc(bad));
    expect(html).toContain("hpb-error");
    const m = messages.find((x) => x.ruleId === "E-SYNTAX");
    expect(m).toBeDefined();
    // Fence opens on line 5 of the Markdown file; the bad statement is line 4 of the block.
    expect(m?.line).toBe(9);
    expect(m?.fatal).toBe(true);
    expect(m?.source).toBe("remark-hpb");
  });

  it("throws with onError: 'throw'", async () => {
    await expect(toHtml(doc("bogus statement\n"), { onError: "throw" })).rejects.toThrow(/E-SYNTAX/);
  });

  it("escapes user text (no HTML injection through titles)", async () => {
    const evil = 'hpb "<script>alert(1)</script>"\nline A "<img src=x onerror=alert(1)>"\nrelease v1.0\n';
    const { html } = await toHtml(doc(evil));
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&#x3C;script>"); // rehype re-serialises &lt; as &#x3C;
  });
});

describe("markdownItHpb", () => {
  it("renders ```hpb fences and leaves other fences to the default renderer", () => {
    const md = new MarkdownIt().use(markdownItHpb);
    const html = md.render(doc(A) + "\n```js\nlet a = 1;\n```\n");
    expect(html).toContain('<div class="hpb-diagram"><svg');
    expect(html).toContain('<pre><code class="language-js">let a = 1;');
  });

  it("works with html: false (SVG comes from the renderer, not from raw HTML)", () => {
    const md = new MarkdownIt({ html: false }).use(markdownItDefault, { theme: "dark" });
    const html = md.render(doc(A));
    expect(html).toContain("hpb-theme-dark");
  });

  it("allocates unique ids per render() call", () => {
    const md = new MarkdownIt().use(markdownItHpb, { idPrefix: "d" });
    const first = md.render(doc(A) + doc(A));
    expect([...first.matchAll(/<svg[^>]* id="([^"]+)"/g)].map((m) => m[1])).toEqual(["d-1", "d-2"]);
    const second = md.render(doc(A));
    expect([...second.matchAll(/<svg[^>]* id="([^"]+)"/g)].map((m) => m[1])).toEqual(["d-1"]);
  });

  it("draws the error box for invalid sources", () => {
    const md = new MarkdownIt().use(markdownItHpb);
    expect(md.render(doc("nonsense here\n"))).toContain("hpb-error");
  });
});
