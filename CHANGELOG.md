# Changelog

All notable changes to HPB Markup are documented here. The project follows
[Semantic Versioning](https://semver.org/); the language version and the package versions move
together for 1.x.

## 1.0.0 — 2026-11-19

First public release of **HPB Markup**, the text-to-diagram toolkit for Horizontal Product Branch
(HPB) diagrams, by Achraf Bouchtarouif El Khiat.

### Language (HPB Markup 1.0)

- Line-oriented, forgiving syntax: case-insensitive keywords, ids `[A-Za-z0-9._-]+`, double-quoted
  strings (typographic quotes accepted), `#` and `%%` comments, optional `@YYYY-MM[-DD]` dates.
- Ordinal time: statement order is time order; dates feed the month axis and are checked to be
  non-decreasing.
- Statements: `hpb`, `config` (`theme`, `labels`, `showClosed`, `time`), `line` (with line forks
  `from <hardware baseline>`), `use`, `release` (kinds `firmware`, `software`, `hardware`,
  `other`; `merges`, `force`, `on`), `plan` (`targets`), branches `improvement` / `issue` / `task`
  / `lab` with aliases (`feature`, `bug`, `defect`, `x`, `t`, `l`, `evolution`, `imp`), `step`
  (`done`, `todo`, `pass`, `fail`), `merge ... into`, `discard`, `target`, `now`, `eos`,
  `collapse`, `note`.
- Rules of the HPB method checked on every document, as far as the text allows: R1 (fork from a
  released baseline), R2 (exactly one terminal; a discard without rationale is a warning), R3 (no
  merge into an older baseline) in full; R4 as an open-branch release gate (a planned baseline is
  not released while branches targeting it are open, overridable with `force`); R5 (line
  forks only from released hardware baselines, work after end of support), R6 (known branch type
  and step state) and R7 (every note attached to exactly one line, baseline or branch) in part.
  The language reference lists what cannot be checked from text.
- Stable diagnostic codes with 1-based line and column, "did you mean" suggestions for
  misspelled statements, duplicate messages that name the earlier definition, at most one syntax
  error per line and an `E-NOT-HPB` hint for files that are not HPB Markup. Invalid API options
  are reported as `E-OPTION` warnings.

### Packages

- **@hpb/core** — parser, model builder, deterministic ordinal layout with greedy lane packing,
  and pure-string SVG renderer following the HPB notation (palette, glyphs, lanes, NOW, EoS,
  line forks, release gates, overdue and forced badges, collapsed-history badges, notes, month
  axis). Branch labels are kept clear of collapsed-history badges and of the verticals of other
  branches on the same side; forks from the same baseline are spread apart; discard rationales
  have a knock-out over the lane guide; one legend chip per type with markers for stacked lanes.
  Themes `default`, `mono` (greyscale, print), `dark` and `auto` (follows
  `prefers-color-scheme` through CSS custom properties inside the SVG). Accessible SVG
  (`role="img"`, title, description, a `<title>` per node). `renderDiagram` returns the SVG and
  the diagnostics in one pass. Zero runtime dependencies; ESM, CommonJS and IIFE (`HPBCore`)
  builds.
- **@hpb/web** — Mermaid-compatible auto-render (`HPB.initialize`, `await HPB.run()`,
  `const { svg, diagnostics, bindFunctions } = await HPB.render(id, code)`, plus `runSync` /
  `renderSync`), the `<hpb-diagram>` custom element (Shadow DOM, `src` attribute, events), hover
  dimming, click and keyboard handling with an accessible structure (`role="group"`, named
  `role="button"` nodes), console output capped at 50 diagnostics, and a `<script>` bundle
  `hpb.min.js` exposing `window.HPB`.
- **@hpb/react** — `<HpbDiagram>` component (SSR-safe, unique element ids per instance through
  `useId`, `onNodeClick`, `onDiagnostics`, `onError`, hover dimming, accessible keyboard access)
  and `@hpb/react/server` (`renderHpbToString`) for React Server Components and the Next.js App
  Router.
- **@hpb/cli** — `hpb render` (file or stdin to SVG, all render options as flags) and
  `hpb validate` (compiler-style `file:line:col` diagnostics with source excerpts, JSON output,
  `--strict`, `--max`), with exit codes for CI.
- **remark-hpb** — remark/unified plugin and markdown-it plugin (`remark-hpb/markdown-it`) that
  turn ` ```hpb ` fences into inline SVG at build time, with diagnostics reported as vfile
  messages and unique element ids per document. Both entries work with `require()` as well.

### Documentation and examples

- Language reference (`docs/language.md`) and integration guide (`docs/integration.md`).
- Examples: plain HTML with the script bundle, Vite + React, Next.js App Router (server and
  client pages), and a static playground.
- Root README with rendered examples (`docs/assets/example-a.svg`, `docs/assets/example-c.svg`)
  and a GitHub Actions workflow (install, build, typecheck, test, docs images up to date).
- Reference fixtures A–E (firmware line, release gate, hardware revision, discard and
  re-target, readability at scale): the white paper's figures for situations A–E written in HPB
  Markup, with the same branches and baselines (checked by a test), used by snapshot tests.
- `scripts/check-release.mjs` (`pnpm release:check`): fails on placeholder metadata before
  publishing; run with `--registry` to check the npm names.

### Known limitations

- `config time = linear` is accepted but renders the ordinal axis (info `I-LINEAR`).
- Unusual inputs such as cross-line merges can draw verticals across other bands.
- Lanes are packed first-fit per type. The paper's Algorithm 1 also prefers the outermost free
  lane for branches still open at NOW, which avoids some crossings; it is not applied yet.
