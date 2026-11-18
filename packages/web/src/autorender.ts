/**
 * Mermaid-like auto-render: finds HPB Markup blocks in the page and replaces
 * their content with the SVG diagram. The asynchronous API matches Mermaid's:
 *
 *   HPB.initialize({ startOnLoad: true, selector: "pre.hpb, code.language-hpb, .hpb", theme: "default" });
 *   await HPB.run();                                  // render now (e.g. after inserting new blocks)
 *   const { svg, diagnostics } = await HPB.render("d1", code);   // nothing touched in the DOM
 *
 * Synchronous variants: HPB.runSync(), HPB.renderSync(id, code) (returns the SVG string).
 */
import { renderDiagram, HpbError } from "@hpb/core";
import type { Diagnostic, HpbOptions, LabelMode, ThemeName } from "@hpb/core";
import { attachInteraction } from "./interaction";
import type { HpbNodeRef } from "./interaction";

export interface HpbWebConfig extends HpbOptions {
  /** Render the matching blocks once the DOM is ready (default true once `initialize` is called). */
  startOnLoad?: boolean;
  /** CSS selector of the blocks to render (default `pre.hpb, code.language-hpb, .hpb`). */
  selector?: string;
  /** Hover dimming, click events and keyboard focus on rendered diagrams (default true). */
  interactive?: boolean;
  /** Called when a branch or baseline of an auto-rendered diagram is clicked. */
  onNodeClick?: (node: HpbNodeRef, container: Element) => void;
  /** Log diagnostics of blocks with errors (and bad options) to the console (default true). */
  logErrors?: boolean;
}

/** Result of the Mermaid-style `render(id, code)`. */
export interface RenderOutput {
  svg: string;
  diagnostics: Diagnostic[];
  /** Attaches hover dimming and click / keyboard handling once the SVG is in the page (like Mermaid's bindFunctions). */
  bindFunctions?: (element: Element) => void;
}

/** Longest list of diagnostics written to the console for one block. */
export const MAX_LOGGED_DIAGNOSTICS = 50;

/** Formats diagnostics for the console, capped at MAX_LOGGED_DIAGNOSTICS lines. */
export function formatDiagnostics(diagnostics: Diagnostic[], max = MAX_LOGGED_DIAGNOSTICS): string {
  const lines = diagnostics
    .slice(0, max)
    .map((d) => (d.line > 0 ? `  ${d.line}:${d.col} ${d.code} ${d.message}` : `  ${d.code} ${d.message}`));
  if (diagnostics.length > max) lines.push(`  ... and ${diagnostics.length - max} more`);
  return lines.join("\n");
}

const warnedOptions = new Set<string>();
/** Logs bad options (E-OPTION) once per distinct message. */
function logOptionWarnings(diagnostics: Diagnostic[]): void {
  if (config.logErrors === false || typeof console === "undefined") return;
  for (const d of diagnostics) {
    if (d.code !== "E-OPTION" || warnedOptions.has(d.message)) continue;
    warnedOptions.add(d.message);
    console.warn(`[hpb] ${d.message}`);
  }
}

export interface RunOptions {
  /** Overrides the configured selector for this call. */
  querySelector?: string;
  /** Render exactly these elements instead of querying the document. */
  nodes?: ArrayLike<Element>;
  /** Re-render blocks that were already rendered (e.g. after changing the theme). */
  force?: boolean;
}

export interface RunResult {
  /** Element whose content was replaced by the diagram. */
  element: Element;
  svg: string;
  diagnostics: Diagnostic[];
}

export const DEFAULT_SELECTOR = "pre.hpb, code.language-hpb, .hpb";

const DEFAULTS: HpbWebConfig = {
  startOnLoad: true,
  selector: DEFAULT_SELECTOR,
  interactive: true,
  logErrors: true,
};

let config: HpbWebConfig = { ...DEFAULTS };
let scheduled = false;
let counter = 0;
const sources = new WeakMap<Element, string>();
const detachers = new WeakMap<Element, () => void>();

const OPTION_KEYS: (keyof HpbOptions)[] = [
  "theme",
  "colWidth",
  "laneHeight",
  "showClosed",
  "labels",
  "fontFamily",
  "padding",
  "ariaTitle",
  "idPrefix",
  "showTitle",
  "onError",
];

function renderOptions(cfg: HpbWebConfig): HpbOptions {
  const out: HpbOptions = {};
  for (const k of OPTION_KEYS) if (cfg[k] !== undefined) (out as Record<string, unknown>)[k] = cfg[k];
  return out;
}

function hasDocument(): boolean {
  return typeof document !== "undefined" && typeof document.querySelectorAll === "function";
}

/** Runs `fn` once the DOM is parsed (always asynchronously, so a following `initialize` call still applies). */
function whenReady(fn: () => void): void {
  if (!hasDocument()) return;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn, { once: true });
  else setTimeout(fn, 0);
}

/** Schedules an automatic `run()` when the DOM is ready, if `startOnLoad` is still true by then. */
export function scheduleStartOnLoad(): void {
  if (scheduled || !hasDocument()) return;
  scheduled = true;
  whenReady(() => {
    scheduled = false;
    if (!config.startOnLoad) return;
    try {
      runSync();
    } catch (e) {
      // onError: "throw" during auto-render: surface it without an unhandled exception.
      if (typeof console !== "undefined") console.error(e);
    }
  });
}

/** Sets the global configuration (merged with the previous one). With `startOnLoad`, renders once the DOM is ready. */
export function initialize(cfg: HpbWebConfig = {}): void {
  config = { ...config, ...cfg };
  if (config.startOnLoad) scheduleStartOnLoad();
}

/** Current configuration (a copy). */
export function getConfig(): HpbWebConfig {
  return { ...config };
}

/** Restores the default configuration (mainly for tests). */
export function resetConfig(): void {
  config = { ...DEFAULTS };
}

/**
 * Renders HPB Markup to an SVG string using the global configuration (synchronous).
 * `id` becomes the SVG id prefix, so several diagrams can live on one page.
 */
export function renderSync(id: string, code: string, options: HpbOptions = {}): string {
  return renderOutput(id, code, options).svg;
}

function renderOutput(id: string, code: string, options: HpbOptions): { svg: string; diagnostics: Diagnostic[] } {
  const merged: HpbOptions = { ...renderOptions(config), ...options };
  const idPrefix = id || options.idPrefix;
  if (idPrefix !== undefined) merged.idPrefix = idPrefix;
  const out = renderDiagram(code, merged);
  logOptionWarnings(out.diagnostics);
  return out;
}

/**
 * Mermaid-compatible render: `const { svg, diagnostics, bindFunctions } = await HPB.render(id, code)`.
 * The DOM is not touched. Rejects with an HpbError only with `onError: "throw"`.
 */
export async function render(id: string, code: string, options: HpbOptions = {}): Promise<RenderOutput> {
  const { svg, diagnostics } = renderOutput(id, code, options);
  const out: RenderOutput = { svg, diagnostics };
  if (config.interactive !== false) {
    out.bindFunctions = (element: Element) => {
      detachers.get(element)?.();
      detachers.set(
        element,
        attachInteraction(element, {
          onNodeClick: (node) => {
            config.onNodeClick?.(node, element);
            element.dispatchEvent(new CustomEvent("hpb-node-click", { detail: node, bubbles: true, composed: true }));
          },
        })
      );
    };
  }
  return out;
}

/** Reads `data-theme`, `data-labels`, `data-show-closed` and `data-show-title` of a block. */
function dataOptions(el: Element): HpbOptions {
  const o: HpbOptions = {};
  const theme = el.getAttribute("data-theme");
  if (theme) o.theme = theme as ThemeName;
  const labels = el.getAttribute("data-labels");
  if (labels) o.labels = labels as LabelMode;
  const closed = el.getAttribute("data-show-closed");
  if (closed !== null) o.showClosed = closed !== "false";
  const title = el.getAttribute("data-show-title");
  if (title !== null) o.showTitle = title !== "false";
  return o;
}

function isRenderable(el: Element): boolean {
  if (el.namespaceURI === "http://www.w3.org/2000/svg") return false; // the rendered <svg class="hpb"> itself
  if (el.closest("svg")) return false;
  if (el.closest("hpb-diagram")) return false;
  const host = el.parentElement?.closest("[data-hpb-processed]");
  return !host;
}

/**
 * Mermaid-compatible run: renders the matching blocks and resolves with the results.
 * Rejects with the first HpbError when `onError: "throw"` (after rendering every block).
 */
export async function run(opts: RunOptions = {}): Promise<RunResult[]> {
  return runSync(opts);
}

/**
 * Finds the HPB blocks (configured selector) and replaces their content with the diagram
 * (synchronous). `<code class="language-hpb">` inside a `<pre>` replaces the whole `<pre>`
 * content. Blocks already rendered are skipped unless `force` is set.
 */
export function runSync(opts: RunOptions = {}): RunResult[] {
  if (!hasDocument() && !opts.nodes) return [];
  const list: Element[] = opts.nodes
    ? Array.from(opts.nodes)
    : Array.from(document.querySelectorAll(opts.querySelector ?? config.selector ?? DEFAULT_SELECTOR));

  const results: RunResult[] = [];
  const seen = new Set<Element>();
  let firstError: HpbError | null = null;

  for (const el of list) {
    if (!isRenderable(el)) continue;
    const parent = el.parentElement;
    const target = el.tagName.toLowerCase() === "code" && parent && parent.tagName.toLowerCase() === "pre" ? parent : el;
    if (seen.has(target)) continue;
    seen.add(target);
    const processed = target.hasAttribute("data-hpb-processed");
    if (processed && !opts.force) continue;

    const source = processed ? sources.get(target) ?? "" : el.textContent ?? "";
    sources.set(target, source);
    const idPrefix = target.id ? `${target.id}-hpb` : `hpb-d${++counter}`;
    const options: HpbOptions = { ...renderOptions(config), ...dataOptions(target), idPrefix, onError: "box" };
    const { svg, diagnostics } = renderDiagram(source, options);
    logOptionWarnings(diagnostics);

    const hasErrors = diagnostics.some((d) => d.severity === "error");
    if (hasErrors) {
      if (config.logErrors !== false && typeof console !== "undefined") {
        const errors = diagnostics.filter((d) => d.severity === "error");
        console.error(`[hpb] ${errors.length} error(s) in HPB block:\n` + formatDiagnostics(errors));
      }
      if (config.onError === "throw" && !firstError) firstError = new HpbError(diagnostics);
    }

    detachers.get(target)?.();
    target.innerHTML = svg;
    target.setAttribute("data-hpb-processed", "true");
    if (hasErrors) target.setAttribute("data-hpb-error", "true");
    else target.removeAttribute("data-hpb-error");

    if (config.interactive !== false) {
      const container = target;
      detachers.set(
        container,
        attachInteraction(container, {
          onNodeClick: (node) => {
            config.onNodeClick?.(node, container);
            container.dispatchEvent(new CustomEvent("hpb-node-click", { detail: node, bubbles: true, composed: true }));
          },
        })
      );
    }
    results.push({ element: target, svg, diagnostics });
  }

  if (firstError) throw firstError;
  return results;
}
