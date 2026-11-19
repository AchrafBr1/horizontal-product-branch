# @hpb/react

> **Not on npm yet.** The install commands and CDN URLs below work once 1.0.0 is published on
> npm; until then, build from source (see the root README,
> [Quick start](https://github.com/AchrafBr1/horizontal-product-branch#quick-start)).

React component for **HPB Markup**, the text language for Horizontal Product Branch diagrams.
Write a few lines of text, get an HPB diagram. SSR-safe, works with the Next.js App Router and Vite.

```bash
npm install @hpb/react        # brings @hpb/core; needs react >= 18
```

## Client component

```tsx
import { HpbDiagram } from "@hpb/react";

const source = `
hpb "Product A — firmware line"
line A "Product A"
release v1.0 @2026-01
improvement I-21 "Faster pairing"
issue X-101 "Crash on boot"
release v1.0.1 merges X-101
release v1.1 @2026-03 merges I-21
`;

export function Roadmap() {
  return (
    <HpbDiagram
      code={source}
      theme="auto"                          // "default" | "mono" | "dark" | "auto"
      onNodeClick={({ kind, id }) => console.log(kind, id)} // "branch" | "baseline"
      onDiagnostics={(all) => console.log(all)} // every render; [] when the source is clean
    />
  );
}
```

| Prop | Type | Notes |
| --- | --- | --- |
| `code` | `string` | HPB Markup source (required). |
| `theme` | `"default" \| "mono" \| "dark" \| "auto"` | Overrides `config theme` in the source. `"auto"` follows the reader's light / dark mode. |
| `showClosed` | `boolean` | Show merged and discarded branches. |
| `labels` | `"full" \| "ref" \| "none"` | Label mode. |
| `options` | `HpbOptions` | Other renderer options: `colWidth`, `laneHeight`, `padding`, `fontFamily`, `ariaTitle`, `idPrefix`, `showTitle`. |
| `onNodeClick` | `({ kind, id }) => void` | Click, Enter or Space on a branch or baseline. Makes them focusable buttons with an accessible name; the SVG becomes `role="group"`. |
| `onDiagnostics` | `(diagnostics) => void` | Called after every render with all diagnostics (errors, warnings, bad options), or `[]` once the source is clean. |
| `onError` | `(diagnostics) => void` | Called only after renders with errors (the error box is shown). Not called when the errors are fixed: use `onDiagnostics` for that. |
| `hoverDim` | `boolean` | Dim everything except the hovered element (default `true`). |
| `className`, `style`, other `div` attributes | | Applied to the wrapper `div.hpb-diagram`. |

The SVG is produced by `renderDiagram` from `@hpb/core` (escaped output, one parse for the SVG and
the diagnostics) during render, memoized on the inputs, so server and client markup are identical. Hover dimming and clicks are attached after
mount by event delegation on the `data-hpb-kind` / `data-hpb-id` attributes of the SVG.

Each `<HpbDiagram>` gets its own element ids from React's `useId()` (stable between server and
client), so the same source can appear twice on a page. `options={{ idPrefix: "..." }}` overrides it.
With `renderHpbToString`, pass a distinct `idPrefix` to each call when a page shows several diagrams.

## Server components (Next.js App Router)

`@hpb/react` is a client module (`"use client"`). In a server component, use the server entry:

```tsx
// app/page.tsx
import { renderHpbToString } from "@hpb/react/server";

export default function Page() {
  return <div dangerouslySetInnerHTML={{ __html: renderHpbToString(source, { theme: "mono" }) }} />;
}
```

`@hpb/react/server` also exports `renderSVG`, `validate`, `HpbError` and `version`.

Examples: `examples/vite-react` and `examples/nextjs` in the repository.

MIT © 2026 Achraf Bouchtarouif El Khiat
