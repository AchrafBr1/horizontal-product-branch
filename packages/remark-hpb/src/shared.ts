/**
 * Shared rendering helpers for the remark and markdown-it plugins.
 * Copyright (c) 2026 Achraf Bouchtarouif El Khiat. MIT License.
 */
import { renderDiagram } from "@hpb/core";
import type { Diagnostic, HpbOptions } from "@hpb/core";

export interface HpbMarkdownOptions extends HpbOptions {
  /**
   * Fence languages that are rendered as HPB diagrams (case-insensitive).
   * Default: ["hpb"].
   */
  languages?: string[];
  /**
   * Class of the `<div>` that wraps each SVG. Default "hpb-diagram".
   * Set to `false` (or "") to emit the bare `<svg>`.
   */
  className?: string | false;
}

export interface RenderedBlock {
  html: string;
  diagnostics: Diagnostic[];
}

export function languageMatcher(languages: string[] | undefined): (info: string | null | undefined) => boolean {
  const set = new Set((languages && languages.length > 0 ? languages : ["hpb"]).map((l) => l.toLowerCase()));
  return (info) => {
    if (!info) return false;
    const lang = info.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    return set.has(lang);
  };
}

const ATTR_ESCAPES: Record<string, string> = { "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" };

function escapeAttr(value: string): string {
  return value.replace(/[&"<>]/g, (c) => ATTR_ESCAPES[c]);
}

/**
 * Keeps element ids unique when a document contains several diagrams:
 * an explicit `idPrefix` gets a per-document counter; identical sources
 * (which would hash to the same default prefix) get a distinct one.
 */
export function createIdAllocator(base: string | undefined): (source: string) => string | undefined {
  let n = 0;
  const seen = new Set<string>();
  return (source) => {
    n++;
    if (base) return `${base}-${n}`;
    if (seen.has(source)) return `hpb-md-${n}`;
    seen.add(source);
    return undefined; // core default: hash of the source
  };
}

/** Renders one fenced block. Throws HpbError only with `onError: "throw"`. */
export function renderBlock(source: string, options: HpbMarkdownOptions, idPrefix: string | undefined): RenderedBlock {
  const { languages: _l, className, ...hpb } = options;
  const renderOptions: HpbOptions = { ...hpb };
  if (idPrefix !== undefined) renderOptions.idPrefix = idPrefix;
  const { svg, diagnostics } = renderDiagram(source, renderOptions);
  const cls = className === undefined ? "hpb-diagram" : className;
  const html = cls ? `<div class="${escapeAttr(cls)}">${svg}</div>` : svg;
  return { html, diagnostics };
}
