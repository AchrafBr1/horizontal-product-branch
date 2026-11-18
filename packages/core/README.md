# @hpb/core

> **Not on npm yet.** The install commands and CDN URLs below work once 1.0.0 is published on
> npm; until then, build from source (see the root README,
> [Quick start](https://github.com/AchrafBr1/hpb#quick-start)).

Parser, rule checks (R1–R3 in full, R4 as an open-branch release gate, R5–R7 in part, see the [language reference, §4](https://github.com/AchrafBr1/hpb/blob/main/docs/language.md#rules)), deterministic layout and pure-string SVG renderer for
**HPB Markup**, the text language for Horizontal Product Branch diagrams.
Zero runtime dependencies; works in Node, SSR and the browser (no DOM needed).

```ts
import { renderDiagram, renderSVG, validate } from "@hpb/core";

const source = `
hpb "Product A — firmware line"
line A "Product A"
release v1.0 @2026-01
improvement I-21 "Faster pairing"
issue X-101 "Crash on boot"
release v1.0.1 merges X-101
release v1.1 @2026-03 merges I-21
`;

const svg = renderSVG(source, { theme: "default" }); // "default" | "mono" | "dark" | "auto"
const diagnostics = validate(source); // [{ severity, code, message, line, col, endCol }]
const both = renderDiagram(source); // { svg, diagnostics } in one pass
```

API: `parse(text)`, `buildModel(ast)`, `layout(model, options)`, `renderSVG(text | model, options)`,
`renderDiagram(text | model, options)`, `validate(text, options?)`, `checkOptions(options)`, plus
`themes`, `version`, `HpbError` and all types. Invalid options come back as `E-OPTION` warnings
(or a `TypeError` with `onError: "throw"`).

Options: `theme`, `colWidth`, `laneHeight`, `showClosed`, `labels`, `fontFamily`, `padding`,
`ariaTitle`, `idPrefix`, `showTitle`, `onError` (`"box"` draws an error box, `"throw"` throws `HpbError`).

Script tag: `dist/index.global.js` exposes the global `HPBCore`.

MIT © 2026 Achraf Bouchtarouif El Khiat
