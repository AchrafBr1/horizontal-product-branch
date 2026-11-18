/**
 * @hpb/react/server: server-side helpers for HPB Markup (React Server Components,
 * Next.js App Router, static generation). No React import, no DOM access.
 * Copyright (c) 2026 Achraf Bouchtarouif El Khiat. MIT License.
 *
 * ```tsx
 * // app/page.tsx (server component)
 * import { renderHpbToString } from "@hpb/react/server";
 * export default function Page() {
 *   return <div dangerouslySetInnerHTML={{ __html: renderHpbToString(source) }} />;
 * }
 * ```
 */
import { renderDiagram, renderSVG, validate } from "@hpb/core";
import type { HpbModel, HpbOptions } from "@hpb/core";

/**
 * Renders HPB Markup text (or a model from buildModel) to an SVG string.
 * Same as `renderSVG` from @hpb/core: the output is escaped and safe to inject
 * with dangerouslySetInnerHTML. With errors it returns the core's error box,
 * or throws an HpbError when `options.onError` is "throw".
 *
 * Element ids default to a hash of the source. When one page shows several
 * diagrams (or the same source twice), pass a unique `idPrefix` to each call,
 * e.g. `renderHpbToString(src, { idPrefix: "roadmap-tab" })`.
 */
export function renderHpbToString(input: string | HpbModel, options: HpbOptions = {}): string {
  return renderSVG(input, options);
}

export { renderDiagram, renderSVG, validate };
export { HpbError, version } from "@hpb/core";
export type { Diagnostic, HpbModel, HpbOptions, LabelMode, RenderResult, Severity, ThemeName } from "@hpb/core";
