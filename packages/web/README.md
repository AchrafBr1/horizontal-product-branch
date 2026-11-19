# @hpb/web

> **Not on npm yet.** The install commands and CDN URLs below work once 1.0.0 is published on
> npm; until then, build from source (see the root README,
> [Quick start](https://github.com/AchrafBr1/horizontal-product-branch#quick-start)).

HPB Markup in the browser. Write a few lines of text, get a Horizontal Product Branch (HPB) diagram.

- **Auto-render, like Mermaid**: `pre.hpb`, `code.language-hpb` and `.hpb` blocks are replaced by their SVG diagram.
- **`<hpb-diagram>` custom element**: Shadow DOM, re-renders when its text or attributes change, emits `hpb-node-click`.
- **`<script>` bundle** `dist/hpb.min.js` (about 60 KB minified, core included) that exposes `window.HPB`.
- **Interaction**: hover dims the other branches to 35 %, click or Enter reports `{ kind, id }`.

Its only runtime dependency is [`@hpb/core`](../core).

## Script tag

```html
<script src="https://cdn.jsdelivr.net/npm/@hpb/web@1.0.0/dist/hpb.min.js"></script>

<pre class="hpb">
hpb "Product A — firmware line"
line A "Product A"
release v1.0 @2026-01
issue X-101 "Crash on boot"
release v1.0.1 merges X-101
</pre>

<hpb-diagram theme="mono" src="diagrams/product-a.hpb"></hpb-diagram>
```

The bundle registers `<hpb-diagram>` and renders the blocks on `DOMContentLoaded`. You can tune it, or opt out, right after the script tag:

```html
<script>
  HPB.initialize({
    startOnLoad: true,                                   // false: render only when you call HPB.run()
    selector: "pre.hpb, code.language-hpb, .hpb",
    theme: "default",                                    // "default" | "mono" | "dark" | "auto"
    onNodeClick: (node, container) => console.log(node.kind, node.id),
  });
</script>
```

## ES modules (Vite, webpack, etc.)

```ts
import { HPB } from "@hpb/web";          // no side effects
HPB.defineElement();                     // registers <hpb-diagram>
HPB.initialize({ startOnLoad: true });   // renders the page's HPB blocks once the DOM is ready

// or, all in one:
import "@hpb/web/auto";
```

## API

| Call | What it does |
| --- | --- |
| `HPB.initialize(config)` | Merges `config` into the global configuration. With `startOnLoad` (the default) it renders once the DOM is ready. |
| `await HPB.run({ querySelector?, nodes?, force? })` | Renders the matching blocks now and resolves with `[{ element, svg, diagnostics }]` (as `mermaid.run`). Blocks already rendered are skipped unless `force` is set, for example after a theme change. `HPB.runSync()` does the same synchronously. |
| `await HPB.render(id, code, options?)` | Resolves with `{ svg, diagnostics, bindFunctions }` (as `mermaid.render`) and leaves the DOM alone. `id` becomes the SVG id prefix; `bindFunctions(element)` adds the interaction after you insert the SVG. `HPB.renderSync(id, code)` returns the SVG string. |
| `HPB.attachInteraction(container, { onNodeClick, hoverDim, dimOpacity, focusable })` | Adds hover dimming and click/keyboard handling to any container that holds an HPB SVG. Returns `detach()`. |
| `HPB.defineElement(tag = "hpb-diagram")` | Registers the custom element. Safe to call more than once, and a no-op during SSR. |
| `HPB.validate(code)`, `HPB.parse(code)`, `HPB.renderSVG(code, options)` | Re-exported from `@hpb/core`. |

`config` accepts every `@hpb/core` render option (`theme`, `labels`, `showClosed`, `colWidth`, `laneHeight`, `padding`, `fontFamily`, `showTitle`, `onError`) plus `startOnLoad`, `selector`, `interactive` (default `true`), `onNodeClick` and `logErrors`.

Per block, `data-theme`, `data-labels`, `data-show-closed` and `data-show-title` override the global config.

A block with errors shows the core error box, gets `data-hpb-error="true"` and has its diagnostics logged to the console (at most 50 lines per block). Invalid options, such as `theme: "drak"`, fall back to the default and are logged once as warnings. With `onError: "throw"`, `run()` still renders every block and then rejects with the first `HpbError`.

Interactive diagrams are accessible: the root `<svg>` becomes `role="group"` (`aria-roledescription="HPB diagram"`) and every branch and baseline a focusable `role="button"` named after its `<title>`. With `interactive: false` (or `no-interaction` on the element) the SVG keeps `role="img"`.

To avoid a flash of raw text before `<hpb-diagram>` is defined, add `hpb-diagram:not(:defined){display:block;white-space:pre;visibility:hidden}` to the page CSS.

Rendered containers get `data-hpb-processed="true"` and dispatch a bubbling `hpb-node-click` event (`event.detail = { kind, id }`).

## `<hpb-diagram>`

| Attribute | |
| --- | --- |
| `src` | URL of a `.hpb` file. Used instead of the text content. |
| `theme` | `default`, `mono` or `dark` |
| `show-closed` | `false` hides merged and discarded branches |
| `labels` | `full`, `ref` or `none` |
| `show-title` | `false` hides the title |
| `fit` | scales the SVG to the element's width |
| `no-interaction` | turns off hover dimming and click events |

Properties:
- `code`: the source string. It takes precedence over the text content and `src`; set it to `null` to go back to them.
- `svg`: the last rendered SVG (read-only).
- `diagnostics`: the diagnostics of the last render (read-only).
- `refresh()`: renders again.

| Event | `detail` |
| --- | --- |
| `hpb-node-click` (bubbles, composed) | `{ kind: "branch" \| "baseline", id }` |
| `hpb-render` | `{ svg, diagnostics }` |
| `hpb-error` (bubbles, composed) | `{ error }`, when `src` could not be loaded |

Styling: the SVG sits inside `::part(diagram)`. Hide the raw text before the element upgrades with `hpb-diagram:not(:defined) { display: none; }`. If the text contains `<` or `&`, wrap it in `<script type="text/hpb">…</script>` inside the element.

## Examples

- [`examples/html`](../../examples/html/index.html): auto-render, a Markdown-style block, the custom element and `HPB.render`.
- [`playground`](../../playground/index.html): a live editor with examples A–E, diagnostics and SVG export. `node playground/build.mjs` writes a self-contained `playground/dist/index.html`.

## License

MIT © 2026 Achraf Bouchtarouif El Khiat
