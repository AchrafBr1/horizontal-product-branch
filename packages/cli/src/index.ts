/**
 * @hpb/cli — command-line front end for HPB Markup.
 * Copyright (c) 2026 Achraf Bouchtarouif El Khiat. MIT License.
 *
 *   hpb render <in.hpb|-> [-o out.svg] [--theme default|mono|dark|auto] [--show-closed] ...
 *   hpb validate <in.hpb|-> [more.hpb ...] [--format text|json] [--strict]
 *
 * The `run()` function is the whole program; `bin.ts` only wires it to the
 * real process. Tests (and other tools) can call `run()` with a fake IO.
 */
import fs from "node:fs";
import path from "node:path";
import { renderSVG, validate, version as languageVersion } from "@hpb/core";
import type { Diagnostic, HpbOptions, LabelMode, ThemeName } from "@hpb/core";

export const version = "1.0.0";

/** Exit codes: 0 ok, 1 the source has errors (or warnings with --strict), 2 usage or I/O error. */
export const EXIT_OK = 0;
export const EXIT_DIAGNOSTICS = 1;
export const EXIT_USAGE = 2;

export interface CliIO {
  /** Reads a file as UTF-8 (throws on failure). */
  readFile(file: string): string;
  /** Writes a UTF-8 file, creating parent folders (throws on failure). */
  writeFile(file: string, content: string): void;
  /** Reads all of standard input. */
  readStdin(): string | Promise<string>;
  stdout(text: string): void;
  stderr(text: string): void;
  /** Use ANSI colours in diagnostics. */
  color: boolean;
}

/** IO bound to the real process (used by the `hpb` executable). */
export function nodeIO(): CliIO {
  return {
    readFile: (file) => fs.readFileSync(file, "utf8"),
    writeFile: (file, content) => {
      const dir = path.dirname(file);
      if (dir && dir !== ".") fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, content, "utf8");
    },
    readStdin: () =>
      new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        process.stdin.on("data", (c: Buffer | string) => chunks.push(typeof c === "string" ? Buffer.from(c) : c));
        process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        process.stdin.on("error", reject);
      }),
    stdout: (t) => process.stdout.write(t),
    stderr: (t) => process.stderr.write(t),
    color: Boolean(process.stderr.isTTY) && !process.env.NO_COLOR && process.env.TERM !== "dumb",
  };
}

export const HELP = `hpb ${version} — HPB Markup (language ${languageVersion}) command-line tool

Usage
  hpb render <input.hpb|-> [-o out.svg] [options]
  hpb validate <input.hpb|-> [more.hpb ...] [--format text|json] [--strict]
  hpb --help | --version

Use '-' as input to read from standard input.

render options
  -o, --output <file>     Write the SVG to <file> (default: standard output)
  -t, --theme <name>      default | mono | dark | auto (follows the reader's light/dark mode)
      --show-closed       Draw merged and discarded branches (overrides 'config showClosed')
      --hide-closed       Hide merged and discarded branches
      --labels <mode>     full | ref | none
      --col-width <px>    Width of one ordinal column (default 48)
      --lane-height <px>  Height of one lane (default 40)
      --padding <px>      Outer padding (default 16)
      --font-family <css> Font stack for all text
      --aria-title <text> Accessible title (defaults to the document title)
      --id-prefix <id>    Prefix for element ids (default: hash of the source)
      --no-title          Do not draw the document title
      --error-box         On errors, still write an SVG with the error box (exit code stays 1)
      --max <n>           Print at most <n> diagnostics (default 50; 0 = all)
  -q, --quiet             Do not print warnings or the "wrote" message

validate options
      --format <fmt>      text (default) | json
      --strict            Exit with code 1 on warnings too
      --max <n>           Print at most <n> diagnostics per file (default 50; 0 = all)

Exit codes: 0 ok, 1 the source has errors, 2 usage or file error.
Diagnostics are printed as  file:line:col: severity [code] message
`;

interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string | true>;
}

const VALUE_FLAGS = new Set([
  "output",
  "theme",
  "labels",
  "col-width",
  "lane-height",
  "padding",
  "font-family",
  "aria-title",
  "id-prefix",
  "format",
  "max",
]);
const BOOL_FLAGS = new Set(["show-closed", "hide-closed", "no-title", "error-box", "quiet", "strict", "help", "version", "no-color"]);
const SHORT: Record<string, string> = { o: "output", t: "theme", q: "quiet", h: "help", v: "version" };

class UsageError extends Error {}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (a === "-" || !a.startsWith("-")) {
      positionals.push(a);
      continue;
    }
    let name: string;
    let inline: string | undefined;
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      name = eq >= 0 ? a.slice(2, eq) : a.slice(2);
      if (eq >= 0) inline = a.slice(eq + 1);
    } else {
      const s = SHORT[a.slice(1)];
      if (!s) throw new UsageError(`Unknown option '${a}'.`);
      name = s;
    }
    if (VALUE_FLAGS.has(name)) {
      const v = inline ?? argv[++i];
      if (v === undefined) throw new UsageError(`Option '--${name}' needs a value.`);
      flags.set(name, v);
    } else if (BOOL_FLAGS.has(name)) {
      if (inline !== undefined) throw new UsageError(`Option '--${name}' does not take a value.`);
      flags.set(name, true);
    } else {
      throw new UsageError(`Unknown option '${a}'. Run 'hpb --help' for the list of options.`);
    }
  }
  return { positionals, flags };
}

function str(flags: ParsedArgs["flags"], name: string): string | undefined {
  const v = flags.get(name);
  return typeof v === "string" ? v : undefined;
}

function num(flags: ParsedArgs["flags"], name: string): number | undefined {
  const v = str(flags, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new UsageError(`Option '--${name}' expects a positive number, got '${v}'.`);
  return n;
}

function oneOf<T extends string>(flags: ParsedArgs["flags"], name: string, allowed: readonly T[]): T | undefined {
  const v = str(flags, name);
  if (v === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(v)) {
    throw new UsageError(`Option '--${name}' expects one of ${allowed.join(" | ")}, got '${v}'.`);
  }
  return v as T;
}

const ANSI = { red: "\x1b[31m", yellow: "\x1b[33m", cyan: "\x1b[36m", dim: "\x1b[2m", bold: "\x1b[1m", reset: "\x1b[0m" };

/** Formats one diagnostic as `file:line:col: severity [code] message`. */
export function formatDiagnostic(file: string, d: Diagnostic, color = false): string {
  const where = `${file}:${d.line}:${d.col}`;
  if (!color) return `${where}: ${d.severity} [${d.code}] ${d.message}`;
  const c = d.severity === "error" ? ANSI.red : d.severity === "warning" ? ANSI.yellow : ANSI.cyan;
  return `${ANSI.bold}${where}${ANSI.reset}: ${c}${d.severity}${ANSI.reset} ${ANSI.dim}[${d.code}]${ANSI.reset} ${d.message}`;
}

/** Source line with a caret under the offending column (helps in terminals). */
function excerpt(source: string, d: Diagnostic, color: boolean): string {
  const line = source.replace(/\r\n?/g, "\n").split("\n")[d.line - 1];
  if (line === undefined) return "";
  const width = Math.max(1, (d.endCol ?? d.col + 1) - d.col);
  const caret = " ".repeat(Math.max(0, d.col - 1)) + "^".repeat(Math.min(width, Math.max(1, line.length - d.col + 2)));
  const gutter = String(d.line).padStart(4) + " | ";
  const pad = " ".repeat(gutter.length - 2) + "| ";
  const mark = color ? (d.severity === "error" ? ANSI.red : ANSI.yellow) + caret + ANSI.reset : caret;
  return `${gutter}${line}\n${pad}${mark}`;
}

async function readInput(input: string, io: CliIO): Promise<{ name: string; source: string }> {
  if (input === "-") return { name: "<stdin>", source: await io.readStdin() };
  try {
    return { name: input, source: io.readFile(input) };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    throw new UsageError(code === "ENOENT" ? `File not found: ${input}` : `Cannot read ${input}: ${(e as Error).message}`);
  }
}

/** Default cap of printed diagnostics per file (a non-HPB file would otherwise flood the terminal). */
export const MAX_DIAGNOSTICS = 50;

function report(
  write: (text: string) => void,
  name: string,
  source: string,
  diags: Diagnostic[],
  opts: { quiet: boolean; color: boolean; max: number }
): void {
  const shown = diags.filter((d) => !opts.quiet || d.severity === "error");
  const limit = opts.max > 0 ? opts.max : Infinity;
  shown.slice(0, limit).forEach((d) => {
    write(formatDiagnostic(name, d, opts.color) + "\n");
    const ex = excerpt(source, d, opts.color);
    if (ex) write(ex + "\n");
  });
  if (shown.length > limit) write(`${name}: ... and ${shown.length - limit} more diagnostic${shown.length - limit === 1 ? "" : "s"} (use --max 0 to print all).\n`);
}

function maxOf(flags: ParsedArgs["flags"]): number {
  const v = str(flags, "max");
  if (v === undefined) return MAX_DIAGNOSTICS;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new UsageError(`Option '--max' expects a whole number >= 0, got '${v}'.`);
  return n;
}

async function cmdRender(args: ParsedArgs, io: CliIO, color: boolean): Promise<number> {
  if (args.positionals.length !== 1) {
    throw new UsageError(
      args.positionals.length === 0
        ? "Missing input. Usage: hpb render <input.hpb|-> [-o out.svg]"
        : "'hpb render' takes exactly one input file."
    );
  }
  const f = args.flags;
  if (f.has("show-closed") && f.has("hide-closed")) throw new UsageError("Use either --show-closed or --hide-closed, not both.");
  const options: HpbOptions = {};
  const theme = oneOf<ThemeName>(f, "theme", ["default", "mono", "dark", "auto"]);
  if (theme) options.theme = theme;
  const labels = oneOf<LabelMode>(f, "labels", ["full", "ref", "none"]);
  if (labels) options.labels = labels;
  if (f.has("show-closed")) options.showClosed = true;
  if (f.has("hide-closed")) options.showClosed = false;
  const colWidth = num(f, "col-width");
  if (colWidth !== undefined) options.colWidth = colWidth;
  const laneHeight = num(f, "lane-height");
  if (laneHeight !== undefined) options.laneHeight = laneHeight;
  const padding = num(f, "padding");
  if (padding !== undefined) options.padding = padding;
  const fontFamily = str(f, "font-family");
  if (fontFamily !== undefined) options.fontFamily = fontFamily;
  const ariaTitle = str(f, "aria-title");
  if (ariaTitle !== undefined) options.ariaTitle = ariaTitle;
  const idPrefix = str(f, "id-prefix");
  if (idPrefix !== undefined) options.idPrefix = idPrefix;
  if (f.has("no-title")) options.showTitle = false;
  const quiet = f.has("quiet");
  const output = str(f, "output");

  const { name, source } = await readInput(args.positionals[0], io);
  const diags = validate(source);
  const hasErrors = diags.some((d) => d.severity === "error");
  report((t) => io.stderr(t), name, source, diags, { quiet, color, max: maxOf(f) });

  if (hasErrors && !f.has("error-box")) {
    const n = diags.filter((d) => d.severity === "error").length;
    io.stderr(`${name}: ${n} error${n === 1 ? "" : "s"}; no SVG written.\n`);
    return EXIT_DIAGNOSTICS;
  }
  const svg = renderSVG(source, { ...options, onError: "box" }) + "\n";
  if (output && output !== "-") {
    try {
      io.writeFile(output, svg);
    } catch (e) {
      throw new UsageError(`Cannot write ${output}: ${(e as Error).message}`);
    }
    if (!quiet) io.stderr(`Wrote ${output}\n`);
  } else {
    io.stdout(svg);
  }
  return hasErrors ? EXIT_DIAGNOSTICS : EXIT_OK;
}

async function cmdValidate(args: ParsedArgs, io: CliIO, color: boolean): Promise<number> {
  if (args.positionals.length === 0) throw new UsageError("Missing input. Usage: hpb validate <input.hpb|-> [more.hpb ...]");
  const format = oneOf(args.flags, "format", ["text", "json"] as const) ?? "text";
  const strict = args.flags.has("strict");
  const quiet = args.flags.has("quiet");
  const max = maxOf(args.flags);
  let failed = false;
  const json: Array<{ file: string; diagnostics: Diagnostic[] }> = [];
  let errors = 0;
  let warnings = 0;
  for (const input of args.positionals) {
    const { name, source } = await readInput(input, io);
    const diags = validate(source);
    const e = diags.filter((d) => d.severity === "error").length;
    const w = diags.filter((d) => d.severity === "warning").length;
    errors += e;
    warnings += w;
    if (e > 0 || (strict && w > 0)) failed = true;
    if (format === "json") json.push({ file: name, diagnostics: diags });
    else {
      // Diagnostics are the command's result: print them on stdout.
      report((t) => io.stdout(t), name, source, diags, { quiet, color, max });
    }
  }
  if (format === "json") io.stdout(JSON.stringify(json, null, 2) + "\n");
  else if (!quiet) {
    const files = args.positionals.length;
    const summary =
      errors === 0 && warnings === 0
        ? `OK: ${files} file${files === 1 ? "" : "s"} valid.`
        : `${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"} in ${files} file${files === 1 ? "" : "s"}.`;
    io.stderr(summary + "\n");
  }
  return failed ? EXIT_DIAGNOSTICS : EXIT_OK;
}

/**
 * Runs the CLI with the given arguments (without `node` and the script path)
 * and returns the exit code. Never calls process.exit.
 */
export async function run(argv: string[], io: CliIO = nodeIO()): Promise<number> {
  let color = io.color;
  try {
    const [command, ...rest] = argv;
    if (command === undefined || command === "help" || command === "--help" || command === "-h") {
      io.stdout(HELP);
      return command === undefined ? EXIT_USAGE : EXIT_OK;
    }
    if (command === "--version" || command === "-v" || command === "version") {
      io.stdout(`${version}\n`);
      return EXIT_OK;
    }
    const args = parseArgs(rest);
    if (args.flags.has("no-color")) color = false;
    if (args.flags.has("help")) {
      io.stdout(HELP);
      return EXIT_OK;
    }
    switch (command) {
      case "render":
        return await cmdRender(args, io, color);
      case "validate":
      case "check":
        return await cmdValidate(args, io, color);
      default:
        throw new UsageError(`Unknown command '${command}'. Use 'hpb render' or 'hpb validate' (see 'hpb --help').`);
    }
  } catch (e) {
    if (e instanceof UsageError) {
      io.stderr(`hpb: ${e.message}\n`);
      return EXIT_USAGE;
    }
    io.stderr(`hpb: unexpected error: ${(e as Error)?.stack ?? String(e)}\n`);
    return EXIT_USAGE;
  }
}
