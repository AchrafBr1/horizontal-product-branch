# @hpb/cli

> **Not on npm yet.** The install commands and CDN URLs below work once 1.0.0 is published on
> npm; until then, build from source (see the root README,
> [Quick start](https://github.com/AchrafBr1/horizontal-product-branch#quick-start)).

Command-line tool for **HPB Markup**, the text language for Horizontal Product Branch (HPB)
diagrams. Renders `.hpb` files to SVG and validates them (handy in CI and pre-commit hooks).

```sh
npm install --save-dev @hpb/cli      # or: pnpm add -D @hpb/cli / npx @hpb/cli ...

hpb render roadmap.hpb -o roadmap.svg
hpb render roadmap.hpb --theme mono --show-closed > roadmap-print.svg
cat roadmap.hpb | hpb render - -o roadmap.svg
hpb validate docs/**/*.hpb
```

## Commands

`hpb render <input.hpb|-> [-o out.svg] [options]` writes the SVG to `-o` (parent folders are
created) or to standard output. Options:

| Option | Meaning |
| --- | --- |
| `-o, --output <file>` | Output file (default: stdout) |
| `-t, --theme <name>` | `default` \| `mono` \| `dark` \| `auto` (follows the reader's light / dark mode) |
| `--show-closed` / `--hide-closed` | Draw / hide merged and discarded branches (overrides `config showClosed`) |
| `--labels <mode>` | `full` \| `ref` \| `none` |
| `--col-width <px>`, `--lane-height <px>`, `--padding <px>` | Geometry (defaults 48, 40, 16) |
| `--font-family <css>` | Font stack |
| `--aria-title <text>` | Accessible title |
| `--id-prefix <id>` | Prefix for element ids (default: hash of the source) |
| `--no-title` | Do not draw the document title |
| `--error-box` | On errors, still write the SVG error box (exit code stays 1) |
| `--max <n>` | Print at most `n` diagnostics (default 50; `0` prints all) |
| `-q, --quiet` | Only print errors |

`hpb validate <input.hpb|-> [more.hpb ...] [--format text|json] [--strict] [--max n]` prints the
diagnostics (at most 50 per file unless `--max`) and a summary. `--strict` also fails on warnings.
A file that is mostly not HPB Markup reports one syntax error per line at most, after an
`E-NOT-HPB` hint.

Use `-` as the input to read from standard input.

## Diagnostics and exit codes

Diagnostics use the compiler format `file:line:col: severity [code] message`, followed by the
source line and a caret:

```
roadmap.hpb:5:7: error [R3] Rule R3: 'X-1' forked from v1.0 and cannot merge into the older (or same) baseline v1.0.
   5 | merge X-1 into v1.0
     |       ^^^
```

| Exit code | Meaning |
| --- | --- |
| 0 | OK (warnings allowed unless `--strict`) |
| 1 | The source has errors (`render` writes nothing unless `--error-box`) |
| 2 | Usage error, unreadable input or unwritable output |

Colours are used on a TTY; set `NO_COLOR=1` or pass `--no-color` to disable them.

## Programmatic use

```ts
import { run, formatDiagnostic } from "@hpb/cli";
const code = await run(["validate", "roadmap.hpb"]); // returns the exit code, never calls process.exit
```

`run(argv, io)` accepts a custom IO object (`readFile`, `writeFile`, `readStdin`, `stdout`,
`stderr`, `color`), which is how the tests drive it.

MIT © 2026 Achraf Bouchtarouif El Khiat
