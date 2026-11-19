# remark-hpb

> **Not on npm yet.** The install commands and CDN URLs below work once 1.0.0 is published on
> npm; until then, build from source (see the root README,
> [Quick start](https://github.com/AchrafBr1/horizontal-product-branch#quick-start)).

Markdown plugins for **HPB Markup**: every ` ```hpb ` fenced code block becomes an inline
SVG Horizontal Product Branch diagram, rendered at build time (no client-side JavaScript).

- `remarkHpb` — [remark](https://github.com/remarkjs/remark) / unified plugin (default export).
- `markdownItHpb` — [markdown-it](https://github.com/markdown-it/markdown-it) plugin
  (also the default export of `remark-hpb/markdown-it`).

````md
```hpb
hpb "Product A — firmware line"
line A "Product A"
release v1.0 @2026-01
issue X-101 "Crash on boot"
release v1.0.1 merges X-101
```
````

## remark / unified

```js
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import remarkHpb from "remark-hpb";

const file = await unified()
  .use(remarkParse)
  .use(remarkHpb, { theme: "default" })
  .use(remarkRehype, { allowDangerousHtml: true }) // the diagram is an mdast `html` node
  .use(rehypeRaw)                                  // or rehypeStringify({ allowDangerousHtml: true })
  .use(rehypeStringify)
  .process(markdown);
```

The plugin replaces the `code` node with an `html` node, so the HTML pipeline must keep raw
HTML (`allowDangerousHtml` + `rehype-raw`). This is safe: the SVG is produced by `@hpb/core`,
which escapes every piece of text taken from the diagram source.

Diagnostics are added to the vfile as messages (`ruleId` = HPB code such as `R3`,
`source` = `"remark-hpb"`, `line` = line in the Markdown file; errors are `fatal: true`),
so `remark-cli` and editor integrations show them. Blocks with errors render the core's
error box; pass `onError: "throw"` to fail the build instead.

Works with Astro, Docusaurus, Next.js MDX pipelines that accept raw HTML, VitePress (via
markdown-it), Eleventy (markdown-it) and any unified pipeline. For MDX, where raw HTML is not
allowed, use the `<HpbDiagram>` component of `@hpb/react` instead.

## markdown-it

```js
import MarkdownIt from "markdown-it";
import markdownItHpb from "remark-hpb/markdown-it";

const md = new MarkdownIt().use(markdownItHpb, { theme: "mono" });
const html = md.render(source); // works with { html: false } too
```

## CommonJS

Both entries also work with `require()`, as in Eleventy configs or older Docusaurus / VitePress
config files:

```js
const remarkHpb = require("remark-hpb");              // the plugin itself (also .remarkHpb, .default)
const markdownItHpb = require("remark-hpb/markdown-it");
eleventyConfig.amendLibrary("md", (md) => md.use(markdownItHpb));
```

## Options (both plugins)

Every `@hpb/core` render option (`theme`, `showClosed`, `labels`, `colWidth`, `laneHeight`,
`padding`, `fontFamily`, `ariaTitle`, `showTitle`, `onError`, `idPrefix`) plus:

| Option | Default | Meaning |
| --- | --- | --- |
| `languages` | `["hpb"]` | Fence languages rendered as diagrams |
| `className` | `"hpb-diagram"` | Class of the wrapping `<div>`; `false` emits the bare `<svg>` |

Element ids stay unique within a document: with `idPrefix: "fig"` the diagrams get
`fig-1`, `fig-2`, ...; without it each diagram uses a hash of its source, and repeated
identical sources get a distinct prefix.

MIT © 2026 Achraf Bouchtarouif El Khiat
