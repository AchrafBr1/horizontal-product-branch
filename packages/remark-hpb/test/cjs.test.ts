/**
 * CommonJS smoke tests of the built package (run `pnpm build` first): the
 * plugins must be usable straight from require(), as in Eleventy configs or
 * older Docusaurus / VitePress config files.
 */
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";

// Self-reference by package name: resolves through the "exports" map ("require" condition).
const require = createRequire(import.meta.url);
const SRC = "```hpb\nline A\nrelease v1\nissue X-1 \"Crash\"\nrelease v1.1 merges X-1\n```\n";

describe("CommonJS entries", () => {
  it("require('remark-hpb') is the remark plugin itself", async () => {
    const plugin = require("remark-hpb");
    expect(typeof plugin).toBe("function");
    expect(plugin.default).toBe(plugin);
    expect(plugin.remarkHpb).toBe(plugin);
    expect(typeof plugin.markdownItHpb).toBe("function");
    const html = String(
      await unified()
        .use(remarkParse)
        .use(plugin)
        .use(remarkRehype, { allowDangerousHtml: true })
        .use(rehypeRaw)
        .use(rehypeStringify)
        .process(SRC)
    );
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
  });

  it("require('remark-hpb/markdown-it') is the markdown-it plugin itself", () => {
    const plugin = require("remark-hpb/markdown-it");
    expect(typeof plugin).toBe("function");
    expect(plugin.default).toBe(plugin);
    const MarkdownIt = require("markdown-it");
    const html = new MarkdownIt().use(plugin).render(SRC);
    expect(html).toContain('<div class="hpb-diagram"><svg');
  });
});
