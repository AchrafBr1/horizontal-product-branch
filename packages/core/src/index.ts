/**
 * @hpb/core — HPB Markup v1.0: text to Horizontal Product Branch diagrams.
 * Copyright (c) 2026 Achraf Bouchtarouif El Khiat. MIT License.
 *
 *   parse(text)              -> { ast, diagnostics }
 *   buildModel(ast)          -> model (rules R1-R7 where checkable, model.diagnostics)
 *   layout(model, options)   -> pixel layout
 *   renderSVG(text | model, options) -> SVG string (Node, SSR, browser; no DOM)
 *   renderDiagram(text | model, options) -> { svg, diagnostics } (one pass)
 *   validate(text, options?) -> diagnostics
 */
import { parse } from "./parser";
import { buildModel } from "./model";
import { checkOptions, layout as computeLayout, resolveOptions } from "./layout";
import { renderErrorSVG, renderLayout } from "./svg";
import type { Diagnostic, HpbLayout, HpbModel, HpbOptions } from "./types";

export { parse } from "./parser";
export { buildModel } from "./model";
export { themes } from "./theme";
export { checkOptions, THEME_NAMES, LABEL_MODES } from "./layout";
export type { HpbTheme } from "./theme";
export * from "./types";

/** Version of the HPB Markup language implemented by this package. */
export const version = "1.0.0";

/** Error thrown by renderSVG when `onError: "throw"` and the source has errors. */
export class HpbError extends Error {
  readonly diagnostics: Diagnostic[];
  constructor(diagnostics: Diagnostic[]) {
    const first = diagnostics.find((d) => d.severity === "error") ?? diagnostics[0];
    super(first ? `HPB ${first.code} at ${first.line}:${first.col}: ${first.message}` : "Invalid HPB source");
    this.name = "HpbError";
    this.diagnostics = diagnostics;
  }
}

/** Computes the pixel layout of a model (deterministic). */
export function layout(model: HpbModel, options: HpbOptions = {}): HpbLayout {
  return computeLayout(model, options);
}

/**
 * Parses and checks a source text; returns every diagnostic (syntax + rules), sorted by position.
 * With `options`, bad renderer options are reported too (code "E-OPTION", line 0).
 */
export function validate(text: string, options?: HpbOptions): Diagnostic[] {
  const { ast, diagnostics } = parse(text);
  const model = buildModel(ast);
  return sortDiagnostics([...checkOptions(options), ...diagnostics, ...model.diagnostics]);
}

/** Result of renderDiagram: the SVG and every diagnostic (source and options). */
export interface RenderResult {
  svg: string;
  diagnostics: Diagnostic[];
}

/**
 * Renders HPB Markup text (or an already built model) to an SVG string.
 * With errors, draws an error box (default) or throws an HpbError (`onError: "throw"`).
 *
 * Element ids start with `options.idPrefix` (default: a hash of the source). When a page
 * shows the same source more than once, pass a different idPrefix to each diagram.
 */
export function renderSVG(input: string | HpbModel, options: HpbOptions = {}): string {
  return renderDiagram(input, options).svg;
}

/**
 * Same as renderSVG, but also returns the diagnostics (one parse for both).
 * Bad options are reported as "E-OPTION" warnings; with `onError: "throw"` they
 * throw a TypeError instead.
 */
export function renderDiagram(input: string | HpbModel, options: HpbOptions = {}): RenderResult {
  const optionDiags = checkOptions(options);
  if (optionDiags.length > 0 && options?.onError === "throw") {
    throw new TypeError(`HPB: ${optionDiags.map((d) => d.message).join(" ")}`);
  }
  let model: HpbModel;
  let diagnostics: Diagnostic[];
  let source = "";
  if (typeof input === "string") {
    source = input;
    const parsed = parse(input);
    model = buildModel(parsed.ast);
    diagnostics = sortDiagnostics([...parsed.diagnostics, ...model.diagnostics]);
  } else if (input && typeof input === "object" && Array.isArray((input as HpbModel).events)) {
    model = input;
    diagnostics = model.diagnostics ?? [];
    source = JSON.stringify(model.events) + (model.title ?? "");
  } else {
    throw new TypeError("renderSVG expects HPB Markup text or a model returned by buildModel().");
  }
  const opt = resolveOptions(model, options, source);
  const all = [...optionDiags, ...diagnostics];
  if (diagnostics.some((d) => d.severity === "error")) {
    if (opt.onError === "throw") throw new HpbError(diagnostics);
    return { svg: renderErrorSVG(diagnostics, { fontFamily: opt.fontFamily, theme: opt.theme, idPrefix: opt.idPrefix }), diagnostics: all };
  }
  const L = computeLayout({ ...model, diagnostics }, { ...options, idPrefix: opt.idPrefix });
  return { svg: renderLayout(L), diagnostics: all };
}

function sortDiagnostics(list: Diagnostic[]): Diagnostic[] {
  return [...list].sort((a, b) => a.line - b.line || a.col - b.col);
}
