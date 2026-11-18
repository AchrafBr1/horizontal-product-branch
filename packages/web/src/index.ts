/**
 * @hpb/web — HPB Markup in the browser.
 * Copyright (c) 2026 Achraf Bouchtarouif El Khiat. MIT License.
 *
 *   import { HPB } from "@hpb/web";
 *   HPB.initialize({ startOnLoad: true, theme: "default" });   // renders pre.hpb / code.language-hpb / .hpb blocks
 *   HPB.defineElement();                                      // registers <hpb-diagram>
 *
 * Importing this module has no side effects; `@hpb/web/auto` registers the element and auto-renders.
 */
import { parse, validate, renderSVG, renderDiagram, themes, version as languageVersion, HpbError } from "@hpb/core";
import { initialize, run, runSync, render, renderSync, getConfig, resetConfig, DEFAULT_SELECTOR } from "./autorender";
import { attachInteraction } from "./interaction";
import { defineHpbElement, getHpbDiagramElement, HPB_ELEMENT_TAG } from "./element";

export {
  initialize,
  run,
  runSync,
  render,
  renderSync,
  getConfig,
  resetConfig,
  formatDiagnostics,
  DEFAULT_SELECTOR,
  MAX_LOGGED_DIAGNOSTICS,
} from "./autorender";
export type { HpbWebConfig, RenderOutput, RunOptions, RunResult } from "./autorender";
export { attachInteraction, nodeRef } from "./interaction";
export type { HpbNodeRef, InteractionOptions } from "./interaction";
export { defineHpbElement, getHpbDiagramElement, HPB_ELEMENT_TAG } from "./element";
export type { HpbDiagramElement, HpbDiagramElementConstructor } from "./element";
export { parse, validate, renderSVG, renderDiagram, themes, HpbError } from "@hpb/core";
export type { Diagnostic, HpbOptions, ThemeName, LabelMode } from "@hpb/core";

/** Version of this package. */
export const version = "1.0.0";

/**
 * Mermaid-style facade, also exposed as `window.HPB` by the <script> bundle.
 * `render` and `run` return Promises, as in Mermaid; `renderSync` / `runSync` do not.
 */
export const HPB = {
  version,
  languageVersion,
  initialize,
  run,
  runSync,
  render,
  renderSync,
  getConfig,
  resetConfig,
  defaultSelector: DEFAULT_SELECTOR,
  defineElement: defineHpbElement,
  getElementClass: getHpbDiagramElement,
  elementTag: HPB_ELEMENT_TAG,
  attachInteraction,
  parse,
  validate,
  renderSVG,
  renderDiagram,
  themes,
  HpbError,
};

export type HpbApi = typeof HPB;

export default HPB;
