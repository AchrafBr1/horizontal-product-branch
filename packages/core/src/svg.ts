/**
 * Pure-string SVG renderer for HPB layouts. No DOM: works in Node, SSR and
 * browsers. Every piece of user text is XML-escaped.
 *
 * Layers (bottom to top), as in hpb.sty: background (gates) < guides (lane
 * guides, separators, NOW, leaders, axis) < branch paths < branch nodes <
 * main lines (lines, forks, EoS) < baselines < front (tags, labels, badges,
 * notes, legend, NOW pill).
 */
import { formatDate, METRICS } from "./layout";
import { COLOR_KEYS, themes, TYPE_LEGEND, TYPE_LETTER, type HpbTheme } from "./theme";
import { escapeXml as esc, n, safeId, textWidth } from "./text";
import type { BranchType, Diagnostic, HpbLayout, LayoutBaseline, LayoutBranch, LayoutLane, LayoutPoint, ResolvedOptions } from "./types";

const M = METRICS;

/** Orthogonal polyline with rounded corners (radius r, clipped to half of each segment). */
export function roundedPath(points: LayoutPoint[], r: number): string {
  if (points.length === 0) return "";
  let d = `M${n(points[0].x)} ${n(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (l1 < 0.01 || l2 < 0.01) continue;
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const u1 = { x: (p1.x - p0.x) / l1, y: (p1.y - p0.y) / l1 };
    const u2 = { x: (p2.x - p1.x) / l2, y: (p2.y - p1.y) / l2 };
    const a = { x: p1.x - u1.x * rr, y: p1.y - u1.y * rr };
    const b = { x: p1.x + u2.x * rr, y: p1.y + u2.y * rr };
    const cross = u1.x * u2.y - u1.y * u2.x;
    if (Math.abs(cross) < 1e-6) {
      d += ` L${n(p1.x)} ${n(p1.y)}`;
      continue;
    }
    d += ` L${n(a.x)} ${n(a.y)} A${n(rr)} ${n(rr)} 0 0 ${cross > 0 ? 1 : 0} ${n(b.x)} ${n(b.y)}`;
  }
  const last = points[points.length - 1];
  d += ` L${n(last.x)} ${n(last.y)}`;
  return d;
}

function checkPath(cx: number, cy: number, s = 1): string {
  return `M${n(cx - 2.6 * s)} ${n(cy - 0.1 * s)} L${n(cx - 0.8 * s)} ${n(cy + 1.9 * s)} L${n(cx + 2.7 * s)} ${n(cy - 2.3 * s)}`;
}
function crossPath(cx: number, cy: number, s = 1): string {
  const k = 2.2 * s;
  return `M${n(cx - k)} ${n(cy - k)} L${n(cx + k)} ${n(cy + k)} M${n(cx - k)} ${n(cy + k)} L${n(cx + k)} ${n(cy - k)}`;
}

interface Ctx {
  t: HpbTheme;
  o: ResolvedOptions;
  p: string; // id prefix
}

function text(
  x: number,
  y: number,
  content: string,
  attrs: { size?: number; bold?: boolean; italic?: boolean; fill: string; anchor?: "start" | "middle" | "end"; halo?: string; cls?: string; extra?: string }
): string {
  const a: string[] = [`x="${n(x)}"`, `y="${n(y)}"`, `font-size="${attrs.size ?? M.font}"`, `fill="${attrs.fill}"`];
  if (attrs.bold) a.push(`font-weight="700"`);
  if (attrs.italic) a.push(`font-style="italic"`);
  if (attrs.anchor && attrs.anchor !== "start") a.push(`text-anchor="${attrs.anchor}"`);
  if (attrs.halo)
    a.push(`stroke="${attrs.halo}" stroke-width="3" stroke-linejoin="round" stroke-opacity="0.9" paint-order="stroke"`);
  if (attrs.cls) a.push(`class="${attrs.cls}"`);
  if (attrs.extra) a.push(attrs.extra);
  return `<text ${a.join(" ")}>${esc(content)}</text>`;
}

function dataAttrs(kind: "branch" | "baseline", id: string): string {
  return `data-hpb-kind="${kind}" data-hpb-id="${esc(id)}"`;
}

const STATE_TEXT: Record<LayoutBranch["state"], string> = {
  merged: "merged",
  awaiting: "resolved, awaiting release",
  open: "open",
  targeted: "open, targeted",
  discarded: "discarded",
};

/** Accessible name of a branch (also the text of its <title>). */
export function branchTitle(b: LayoutBranch): string {
  const parts = [`${b.id}${b.title ? ` ${b.title}` : ""}`, `${b.type} branch forked from ${b.fork}`];
  if (b.state === "merged") parts.push(`merged into ${b.mergeInto}`);
  else if (b.state === "awaiting") parts.push(`resolved, awaiting release in ${b.mergeInto}`);
  else if (b.state === "targeted") parts.push(`open, targeted at ${b.target}`);
  else parts.push(STATE_TEXT[b.state]);
  return parts.join(" — ");
}

/** Accessible name of a baseline (also the text of its <title>). */
export function baselineTitle(b: LayoutBaseline): string {
  const kind = b.kind === "other" ? "process" : b.kind;
  let s = `${b.id} — ${b.status === "planned" ? "planned" : "released"} ${kind} baseline`;
  if (b.date) s += `, ${b.status === "planned" ? "target " : ""}${formatDate(b.date)}`;
  if (b.overdue) s += " (overdue)";
  if (b.forced) s += " (released with force: rule R4 overridden)";
  if (b.collapsed) s += `, ${b.collapsed} merged branches collapsed`;
  return s;
}

// ------------------------------------------------------------------ theme "auto"
// Every colour is first written as a token, then each fill / stroke attribute
// becomes `fill="<light colour>" style="fill:var(--hpb-<key>)"`. The light
// colour is the fallback for renderers without CSS; a <style> inside the SVG
// defines the variables for light and dark (prefers-color-scheme).

const TOKEN = (k: string) => `@@hpb-${k}@@`;
const TOKEN_THEME: HpbTheme = (() => {
  const t: Record<string, unknown> = { ...themes.default, name: "auto" };
  for (const k of COLOR_KEYS) t[k] = TOKEN(k);
  return t as unknown as HpbTheme;
})();

function cssVarName(k: string): string {
  return `--hpb-${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
}

function autoStyle(P: string): string {
  const decl = (t: HpbTheme) => COLOR_KEYS.map((k) => `${cssVarName(k)}:${t[k]}`).join(";");
  // :where() keeps specificity at zero, so a page can override any --hpb-* variable.
  return `<style>:where(#${P}){${decl(themes.default)}}@media (prefers-color-scheme: dark){:where(#${P}){${decl(themes.dark)}}}</style>`;
}

function resolveAutoTokens(svg: string): string {
  return svg.replace(/<[a-zA-Z][^<>]*@@hpb-[^<>]*>/g, (tag) => {
    const styles: string[] = [];
    const out = tag.replace(/ (fill|stroke)="@@hpb-([A-Za-z]+)@@"/g, (_m, attr: string, key: string) => {
      const light = (themes.default as unknown as Record<string, string>)[key] ?? "#000000";
      styles.push(`${attr}:var(${cssVarName(key)},${light})`);
      return ` ${attr}="${light}"`;
    });
    if (styles.length === 0) return out;
    return out.replace(/(\/?)>$/, ` style="${styles.join(";")}"$1>`);
  });
}

/** Renders a computed layout to an SVG string. */
export function renderLayout(L: HpbLayout): string {
  const o = L.options;
  const auto = o.theme === "auto";
  const t: HpbTheme = auto ? TOKEN_THEME : themes[o.theme as Exclude<typeof o.theme, "auto">] ?? themes.default;
  const ctx: Ctx = { t, o, p: o.idPrefix };
  const P = ctx.p;
  const out: string[] = [];
  const title = o.ariaTitle ?? L.title ?? "HPB diagram";
  const released = L.baselines.filter((b) => b.status === "released").length;
  const plannedN = L.baselines.length - released;
  const openN = L.branches.filter((b) => b.state === "open" || b.state === "targeted").length;
  const desc = `Horizontal Product Branch diagram: ${L.bands.length} product line${L.bands.length === 1 ? "" : "s"}, ${released} released and ${plannedN} planned baseline${plannedN === 1 ? "" : "s"}, ${L.branches.length} branch${L.branches.length === 1 ? "" : "es"} (${openN} open).`;

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" id="${P}" class="hpb hpb-theme-${t.name}" width="${L.width}" height="${L.height}" viewBox="0 0 ${L.width} ${L.height}" role="img" aria-labelledby="${P}-title ${P}-desc" font-family="${esc(o.fontFamily)}">`
  );
  out.push(`<title id="${P}-title">${esc(title)}</title>`);
  out.push(`<desc id="${P}-desc">${esc(desc)}</desc>`);
  if (auto) out.push(autoStyle(P));
  out.push(`<rect class="hpb-bg" x="0" y="0" width="${L.width}" height="${L.height}" fill="${t.background}"/>`);

  // ------------------------------------------------------------ background: gates
  out.push(`<g class="hpb-layer-background">`);
  for (const b of L.baselines) {
    if (!b.gate) continue;
    const g = b.gate;
    out.push(
      `<rect x="${n(g.x1)}" y="${n(g.y1)}" width="${n(g.x2 - g.x1)}" height="${n(g.y2 - g.y1)}" rx="4" fill="${t.gateFill}" fill-opacity="${t.gateOpacity}" stroke="${t.muted}" stroke-width="0.6"/>`
    );
  }
  out.push(`</g>`);

  // ------------------------------------------------------------ guides
  out.push(`<g class="hpb-layer-guides">`);
  for (const band of L.bands) {
    for (const lane of band.lanes) {
      out.push(
        `<path d="M${n(L.guideX1)} ${n(lane.y)} H${n(L.guideX2)}" stroke="${t.guide}" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="0 4.5" fill="none"/>`
      );
    }
    if (band.separatorY !== null) {
      out.push(`<path d="M${n(o.padding)} ${n(band.separatorY)} H${n(L.guideX2)}" stroke="${t.guide}" stroke-width="0.8" fill="none"/>`);
    }
  }
  if (L.now) {
    out.push(
      `<path class="hpb-now-line" d="M${n(L.now.x)} ${n(L.now.y1)} V${n(L.now.y2)}" stroke="${t.now}" stroke-width="1.2" stroke-dasharray="4 2.5" fill="none"/>`
    );
  }
  for (const note of L.notes) {
    const lx = Math.min(Math.max(note.anchor.x, note.x + 6), note.x + note.width - 6);
    out.push(
      `<path d="M${n(lx)} ${n(note.y)} L${n(note.anchor.x)} ${n(note.anchor.y)}" stroke="${t.muted}" stroke-width="0.6" fill="none"/>`
    );
  }
  if (L.axis) {
    const a = L.axis;
    out.push(`<path d="M${n(a.x1)} ${n(a.y)} H${n(a.x2)}" stroke="${t.discardedInk}" stroke-width="0.6" fill="none"/>`);
    out.push(`<path d="M${n(a.x2 + 4)} ${n(a.y)} L${n(a.x2 - 1)} ${n(a.y - 2.2)} L${n(a.x2 - 1)} ${n(a.y + 2.2)} Z" fill="${t.discardedInk}"/>`);
    for (const tk of a.ticks) out.push(`<path d="M${n(tk.x)} ${n(a.y)} V${n(a.y + 3)}" stroke="${t.discardedInk}" stroke-width="0.6"/>`);
  }
  out.push(`</g>`);

  // ------------------------------------------------------------ branch paths
  out.push(`<g class="hpb-layer-branches" fill="none" stroke-linecap="round" stroke-linejoin="round">`);
  for (const b of L.branches) {
    const color = b.state === "discarded" ? t.discardedInk : t.ink;
    const parts: string[] = [];
    parts.push(`<path class="hpb-path" d="${roundedPath(b.solid, M.corner)}" stroke="${color}" stroke-width="2"/>`);
    if (b.dashed) {
      parts.push(
        `<path class="hpb-path-target" d="${roundedPath(b.dashed, M.corner)}" stroke="${t.ink}" stroke-width="1.6" stroke-linecap="butt" stroke-dasharray="4 3"/>`
      );
    }
    for (const f of b.faded) {
      parts.push(
        `<path class="hpb-path-retargeted" d="${roundedPath(f, M.corner)}" stroke="${t.ink}" stroke-width="1.6" stroke-linecap="butt" stroke-dasharray="4 3" opacity="0.35"/>`
      );
    }
    out.push(`<g class="hpb-branch-path" ${dataAttrs("branch", b.id)}>${parts.join("")}</g>`);
  }
  out.push(`</g>`);

  // ------------------------------------------------------------ branch nodes
  out.push(`<g class="hpb-layer-branch-nodes">`);
  for (const b of L.branches) out.push(branchNodes(ctx, b));
  out.push(`</g>`);

  // ------------------------------------------------------------ main lines
  out.push(`<g class="hpb-layer-lines" fill="none">`);
  for (const band of L.bands) {
    const y = band.mainY;
    if (band.fork) {
      out.push(
        `<path class="hpb-line-fork" d="M${n(band.fork.x)} ${n(band.fork.fromY)} V${n(band.fork.toY)}" stroke="${t.ink}" stroke-width="3" stroke-linecap="round"/>`
      );
    }
    if (band.solidEndX > band.startX) {
      out.push(`<path class="hpb-main" d="M${n(band.startX)} ${n(y)} H${n(band.solidEndX)}" stroke="${t.ink}" stroke-width="3"/>`);
    }
    let contFrom = Math.max(band.solidEndX, band.startX);
    if (band.plannedEndX !== null && band.eosX === null && band.plannedEndX > band.solidEndX) {
      out.push(
        `<path class="hpb-main-planned" d="M${n(band.solidEndX)} ${n(y)} H${n(band.plannedEndX)}" stroke="${t.ink}" stroke-width="3" stroke-dasharray="6 4" stroke-dashoffset="-3"/>`
      );
      contFrom = band.plannedEndX;
    }
    if (band.eosX === null) {
      out.push(
        `<path class="hpb-main-continuation" d="M${n(contFrom + 6)} ${n(y)} H${n(L.guideX2)}" stroke="${t.ink}" stroke-width="2" stroke-linecap="round" stroke-dasharray="0 5"/>`
      );
    } else {
      out.push(
        `<path class="hpb-eos" d="M${n(band.eosX)} ${n(y - 12)} V${n(y + 12)}" stroke="${t.ink}" stroke-width="3"/>`
      );
    }
    if (band.origin) out.push(`<circle cx="${n(band.origin.x)}" cy="${n(y)}" r="${M.originR}" fill="${t.ink}"/>`);
  }
  out.push(`</g>`);

  // ------------------------------------------------------------ baselines
  out.push(`<g class="hpb-layer-baselines">`);
  for (const b of L.baselines) out.push(baselineNode(ctx, b));
  out.push(`</g>`);

  // ------------------------------------------------------------ front
  out.push(`<g class="hpb-layer-front">`);
  for (const b of L.baselines) out.push(baselineFront(ctx, b));
  for (const b of L.branches) out.push(branchFront(ctx, b));
  for (const band of L.bands) {
    if (band.eosX !== null) out.push(text(band.eosX + 6, band.mainY + 3.5, "EoS", { bold: true, fill: t.text, halo: t.halo }));
  }
  for (const b of L.baselines) {
    if (b.gate) out.push(text(b.gate.x1 + 4, b.gate.y2 - 5, b.gate.label, { bold: true, fill: t.text }));
  }
  for (const note of L.notes) {
    out.push(
      `<g class="hpb-note" data-hpb-ref="${esc(note.ref)}"><rect x="${n(note.x)}" y="${n(note.y)}" width="${n(note.width)}" height="${n(note.height)}" rx="2" fill="${t.background}" stroke="${t.calloutFrame}" stroke-width="0.6"/>${text(note.x + note.width / 2, note.y + note.height / 2 + 3.5, note.text, { fill: t.text, anchor: "middle" })}</g>`
    );
  }
  if (L.now) {
    const w = textWidth("NOW", M.font, true) + 9;
    out.push(
      `<g class="hpb-now"><rect x="${n(L.now.x - w / 2)}" y="${n(L.now.y1 - 15)}" width="${n(w)}" height="15" rx="2" fill="${t.now}"/>${text(L.now.x, L.now.y1 - 4, "NOW", { bold: true, fill: t.nowText, anchor: "middle" })}</g>`
    );
  }
  if (L.axis) {
    const a = L.axis;
    for (const tk of a.ticks) out.push(text(tk.x, a.y + 14, tk.text, { fill: t.muted, anchor: "middle" }));
    out.push(text(a.x2 + 7, a.y + 3.5, "time", { fill: t.muted, italic: true }));
  }
  // Legend column: one chip per line and per branch type; extra (stacked) lanes
  // of a type get a small tinted marker joined to the type chip by a thin bracket.
  out.push(`<g class="hpb-legend">`);
  for (const band of L.bands) {
    out.push(legendBox(ctx, L.legend.x, L.legend.width, band.mainY, band.label, t.main, `${band.line}`));
    const primary = new Map<BranchType, LayoutLane>();
    for (const lane of band.lanes) {
      const cur = primary.get(lane.type);
      if (!cur || Math.abs(lane.lane) < Math.abs(cur.lane)) primary.set(lane.type, lane);
    }
    for (const lane of band.lanes) {
      const first = primary.get(lane.type) as LayoutLane;
      if (first === lane) out.push(legendBox(ctx, L.legend.x, L.legend.width, lane.y, TYPE_LEGEND[lane.type], t[lane.type]));
      else out.push(legendStack(ctx, L.legend.x + L.legend.width, first.y, lane.y, t[lane.type]));
    }
  }
  out.push(`</g>`);
  if (L.titleY !== null && L.title) {
    out.push(text(o.padding, L.titleY, L.title, { size: 13, bold: true, fill: t.text, cls: "hpb-title" }));
  }
  out.push(`</g>`);
  out.push(`</svg>`);
  const svg = out.join("\n");
  return auto ? resolveAutoTokens(svg) : svg;
}

/** Marker of an additional lane of a type whose chip sits on another lane. */
function legendStack(ctx: Ctx, right: number, chipY: number, laneY: number, fill: string): string {
  const t = ctx.t;
  const h = M.legendH;
  const dir = Math.sign(laneY - chipY);
  const x = right - 7;
  return `<g class="hpb-legend-stack"><path d="M${n(x)} ${n(chipY + (dir * h) / 2)} V${n(laneY - (dir * 5))}" stroke="${t.ink}" stroke-width="0.8" fill="none"/><rect x="${n(right - 14)}" y="${n(laneY - 5)}" width="14" height="10" rx="2" fill="${fill}" stroke="${t.ink}" stroke-width="0.8"/></g>`;
}

function legendBox(ctx: Ctx, x: number, w: number, cy: number, label: string, fill: string, line?: string): string {
  const t = ctx.t;
  const maxText = w - 10;
  let lines = [label];
  if (textWidth(label, M.font, true) > maxText) lines = wrap2(label, maxText);
  const h = lines.length > 1 ? 26 : M.legendH;
  const top = cy - h / 2;
  const texts = lines
    .map((s, i) => text(x + w / 2, top + (lines.length > 1 ? 10.5 + i * 11 : 11.5), s, { bold: true, fill: t.nodeText, anchor: "middle" }))
    .join("");
  const attr = line !== undefined ? ` data-hpb-line="${esc(line)}"` : "";
  return `<g class="hpb-legend-box"${attr}><rect x="${n(x)}" y="${n(top)}" width="${n(w)}" height="${h}" rx="2" fill="${fill}" stroke="${t.ink}" stroke-width="0.8"/>${texts}</g>`;
}

function wrap2(label: string, maxW: number): string[] {
  const words = label.split(/\s+/);
  if (words.length < 2) return [truncate(label, maxW)];
  let best = 1;
  let bestScore = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const score = Math.max(textWidth(a, M.font, true), textWidth(b, M.font, true));
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return [truncate(words.slice(0, best).join(" "), maxW), truncate(words.slice(best).join(" "), maxW)];
}

function truncate(s: string, maxW: number): string {
  if (textWidth(s, M.font, true) <= maxW) return s;
  let out = s;
  while (out.length > 1 && textWidth(`${out}…`, M.font, true) > maxW) out = out.slice(0, -1);
  return `${out}…`;
}

function branchNodes(ctx: Ctx, b: LayoutBranch): string {
  const t = ctx.t;
  const fill = t[b.type];
  const parts: string[] = [`<title>${esc(branchTitle(b))}</title>`];
  // steps
  for (const s of b.steps) {
    const sf = s.state === "todo" ? t.hollow : fill;
    parts.push(
      `<circle class="hpb-step hpb-step-${s.state}" cx="${n(s.x)}" cy="${n(s.y)}" r="${M.rStep}" fill="${sf}" stroke="${t.ink}" stroke-width="1.2"><title>${esc(`${b.id}: ${s.state}${s.text ? ` — ${s.text}` : ""}`)}</title></circle>`
    );
  }
  // terminal
  const term = b.terminal;
  if (term) {
    if (term.kind === "merge") {
      parts.push(
        `<circle class="hpb-terminal-merge" cx="${n(term.x)}" cy="${n(term.y)}" r="${M.rEvent}" fill="${fill}" stroke="${t.ink}" stroke-width="1.6"/>`,
        `<path d="${checkPath(term.x, term.y, 1.15)}" fill="none" stroke="${t.nodeText}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`
      );
    } else if (term.kind === "discard") {
      parts.push(
        `<circle class="hpb-terminal-discard" cx="${n(term.x)}" cy="${n(term.y)}" r="${M.rEvent}" fill="${t.discarded}" stroke="${t.muted}" stroke-width="1.6"/>`,
        `<path d="${crossPath(term.x, term.y)}" fill="none" stroke="${t.text}" stroke-width="1.3" stroke-linecap="round"/>`
      );
    } else {
      parts.push(
        `<circle class="hpb-head-ring" cx="${n(term.x)}" cy="${n(term.y)}" r="${M.rHead}" fill="none" stroke="${fill}" stroke-width="1.6"/>`,
        `<circle class="hpb-head" cx="${n(term.x)}" cy="${n(term.y)}" r="${M.rEvent}" fill="${t.hollow}" stroke="${t.ink}" stroke-width="1.6"/>`
      );
    }
  }
  // start node with the type letter
  const startFill = fill;
  parts.push(
    `<circle class="hpb-start" cx="${n(b.start.x)}" cy="${n(b.start.y)}" r="${M.rEvent}" fill="${startFill}" stroke="${t.ink}" stroke-width="1.6"/>`,
    text(b.start.x, b.start.y + 3.6, TYPE_LETTER[b.type], { bold: true, fill: t.nodeText, anchor: "middle" })
  );
  return `<g class="hpb-branch hpb-type-${b.type} hpb-state-${b.state}" id="${ctx.p}-b-${safeId(b.id)}" ${dataAttrs("branch", b.id)} tabindex="-1">${parts.join("")}</g>`;
}

function branchFront(ctx: Ctx, b: LayoutBranch): string {
  const t = ctx.t;
  const parts: string[] = [];
  for (const s of b.steps) {
    if (s.state === "pass") {
      parts.push(
        `<path d="${checkPath(s.x, s.y + 9.5)}" fill="none" stroke="${t.pass}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`
      );
    } else if (s.state === "fail") {
      parts.push(`<path d="${crossPath(s.x, s.y + 9.5, 0.9)}" fill="none" stroke="${t.fail}" stroke-width="1.4" stroke-linecap="round"/>`);
    }
  }
  if (b.label) {
    parts.push(text(b.label.x, b.label.y, b.label.text, { fill: t.text, halo: t.halo, cls: "hpb-label" }));
  }
  if (b.reason) {
    // Knock-out behind the rationale: the dotted lane guide stops under the text.
    const w = textWidth(b.reason.text, M.font) + 6;
    parts.push(
      `<rect class="hpb-reason-bg" x="${n(b.reason.x - 3)}" y="${n(b.reason.y - 10)}" width="${n(w)}" height="13" fill="${t.background}"/>`,
      text(b.reason.x, b.reason.y, b.reason.text, { fill: t.muted, italic: true, halo: t.halo, cls: "hpb-reason" })
    );
  }
  if (parts.length === 0) return "";
  return `<g class="hpb-branch-front" ${dataAttrs("branch", b.id)}>${parts.join("")}</g>`;
}

function baselineNode(ctx: Ctx, b: LayoutBaseline): string {
  const t = ctx.t;
  const parts: string[] = [`<title>${esc(baselineTitle(b))}</title>`];
  if (b.status === "planned") {
    parts.push(
      `<circle cx="${n(b.x)}" cy="${n(b.y)}" r="${M.rBaseline}" fill="${t.hollow}" stroke="${b.overdue ? t.overdue : t.ink}" stroke-width="1.4" stroke-dasharray="2.6 1.8"/>`
    );
  } else if (b.kind === "hardware") {
    const h = M.hwHalf;
    parts.push(
      `<path d="M${n(b.x)} ${n(b.y - h)} L${n(b.x + h)} ${n(b.y)} L${n(b.x)} ${n(b.y + h)} L${n(b.x - h)} ${n(b.y)} Z" fill="${t.hardware}" stroke="${t.ink}" stroke-width="1.6" stroke-linejoin="round"/>`
    );
  } else if (b.kind === "other") {
    const h = M.procHalf;
    parts.push(
      `<rect x="${n(b.x - h)}" y="${n(b.y - h)}" width="${2 * h}" height="${2 * h}" fill="${t.main}" stroke="${t.ink}" stroke-width="1.6"/>`
    );
  } else {
    parts.push(`<circle cx="${n(b.x)}" cy="${n(b.y)}" r="${M.rBaseline}" fill="${t.main}" stroke="${t.ink}" stroke-width="2.5"/>`);
  }
  return `<g class="hpb-baseline hpb-kind-${b.kind} hpb-status-${b.status}" id="${ctx.p}-v-${safeId(b.id)}" ${dataAttrs("baseline", b.id)} tabindex="-1">${parts.join("")}</g>`;
}

function baselineFront(ctx: Ctx, b: LayoutBaseline): string {
  const t = ctx.t;
  const tag = b.tag;
  const parts: string[] = [];
  const planned = b.status === "planned";
  const fill = b.kind === "hardware" && !planned ? t.hardware : planned ? t.hollow : t.main;
  const stroke = b.overdue ? t.overdue : t.ink;
  const tx = tag.x - tag.width / 2;
  parts.push(
    `<rect class="hpb-tag" x="${n(tx)}" y="${n(tag.y)}" width="${n(tag.width)}" height="${tag.height}" fill="${fill}" stroke="${stroke}" stroke-width="${b.overdue ? 1.2 : 1}"${planned ? ` stroke-dasharray="2 1.4"` : ""}/>`
  );
  parts.push(text(tag.x, tag.y + tag.height / 2 + 3.6, tag.text, { bold: true, fill: planned ? t.text : t.nodeText, anchor: "middle" }));
  // short down arrow from the tag to the node
  const half = b.kind === "hardware" ? M.hwHalf : b.kind === "other" ? M.procHalf : M.rBaseline;
  const ay1 = tag.y + tag.height;
  const ay2 = b.y - half - 0.6;
  parts.push(
    `<path d="M${n(tag.x)} ${n(ay1)} V${n(ay2 - 2.6)}" stroke="${t.ink}" stroke-width="0.9" fill="none"/>`,
    `<path d="M${n(tag.x)} ${n(ay2)} L${n(tag.x - 1.9)} ${n(ay2 - 3.2)} L${n(tag.x + 1.9)} ${n(ay2 - 3.2)} Z" fill="${t.ink}"/>`
  );
  if (b.caption) {
    const color = b.caption.kind === "hardware" ? t.hardwareInk : b.overdue ? t.overdue : t.muted;
    parts.push(text(b.caption.x, b.caption.y + 3.5, b.caption.text, { italic: true, fill: color, halo: t.halo }));
  }
  if (b.overdue || b.forced) {
    const cx = tx - 7.5;
    const cy = tag.y + tag.height / 2;
    parts.push(
      `<circle cx="${n(cx)}" cy="${n(cy)}" r="6" fill="${b.overdue ? t.overdue : t.warn}"/>`,
      text(cx, cy + 3.5, "!", { bold: true, fill: "#FFFFFF", anchor: "middle" })
    );
  }
  if (b.collapsed > 0) {
    const cy = b.y + half + 10;
    const label = String(b.collapsed);
    const r = Math.max(M.badgeR, textWidth(label, M.font, true) / 2 + 3);
    parts.push(
      `<g class="hpb-collapsed"><title>${esc(`${b.collapsed} merged branches collapsed into ${b.id}`)}</title><circle cx="${n(b.x)}" cy="${n(cy)}" r="${n(r)}" fill="${t.badge}"/>${text(b.x, cy + 3.5, label, { bold: true, fill: t.badgeText, anchor: "middle" })}</g>`
    );
  }
  return `<g class="hpb-baseline-front" ${dataAttrs("baseline", b.id)}>${parts.join("")}</g>`;
}

/** SVG shown instead of the diagram when the source has errors. */
export function renderErrorSVG(diagnostics: Diagnostic[], opts: { fontFamily?: string; theme?: string; idPrefix?: string } = {}): string {
  const errors = diagnostics.filter((d) => d.severity === "error");
  const list = (errors.length ? errors : diagnostics).slice(0, 8);
  const more = (errors.length ? errors : diagnostics).length - list.length;
  const t = themes[(opts.theme as keyof typeof themes) ?? "default"] ?? themes.default; // "auto": default palette
  const lines = list.map((d) => `Line ${d.line}:${d.col} [${d.code}] ${d.message}`);
  if (more > 0) lines.push(`… and ${more} more`);
  const w = Math.min(980, Math.max(360, ...lines.map((l) => textWidth(l, 11) + 40)));
  const h = 46 + lines.length * 17 + 12;
  const P = opts.idPrefix ?? "hpb-error";
  const ff = esc(opts.fontFamily ?? "Inter, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif");
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" id="${esc(P)}" class="hpb hpb-error" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${n(w)} ${n(h)}" role="img" aria-labelledby="${esc(P)}-title" font-family="${ff}">`
  );
  out.push(`<title id="${esc(P)}-title">HPB diagram error: ${esc(lines[0] ?? "invalid source")}</title>`);
  out.push(`<rect x="1" y="1" width="${n(w - 2)}" height="${n(h - 2)}" rx="6" fill="${t.background}" stroke="${t.overdue}" stroke-width="1.5"/>`);
  out.push(text(16, 26, `HPB: ${errors.length || diagnostics.length} problem${(errors.length || diagnostics.length) === 1 ? "" : "s"} in the diagram source`, { size: 13, bold: true, fill: t.overdue }));
  lines.forEach((l, i) => out.push(text(16, 50 + i * 17, l, { size: 11, fill: t.text })));
  out.push(`</svg>`);
  return out.join("\n");
}
