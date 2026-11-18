/**
 * Deterministic HPB layout: ordinal columns (statement order = time order),
 * NOW column, planned baselines right of NOW, one lane band per product line
 * and greedy interval partitioning of branch lanes per side.
 *
 * The output is plain pixel geometry; the SVG renderer only paints it.
 */
import { dateKey } from "./model";
import { TYPE_LEGEND } from "./theme";
import { hash, monthName, textWidth } from "./text";
import type {
  BranchType,
  DateValue,
  Diagnostic,
  HpbLayout,
  HpbModel,
  HpbOptions,
  LayoutBand,
  LayoutBaseline,
  LayoutBranch,
  LayoutColumn,
  LayoutNote,
  LayoutPoint,
  LayoutTick,
  ModelBaseline,
  ModelBranch,
  ModelLine,
  ResolvedOptions,
} from "./types";

// Glyph metrics (px at scale 1), from the HPB notation (hpb.sty).
export const METRICS = {
  font: 10,
  tagFont: 10,
  tagH: 14,
  tagPadX: 3.5,
  tagGap: 5.5,
  rBaseline: 9,
  rEvent: 7,
  rStep: 4,
  rHead: 10.5,
  hwHalf: 11,
  procHalf: 7.5,
  corner: 8,
  originR: 4.5,
  badgeR: 8,
  legendH: 16,
  noteH: 17,
} as const;

const DEFAULTS: Omit<ResolvedOptions, "idPrefix"> = {
  theme: "default",
  colWidth: 48,
  laneHeight: 40,
  showClosed: true,
  labels: "full",
  fontFamily: "Inter, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  padding: 16,
  showTitle: true,
  onError: "box",
};

/** Merges explicit options > document config > defaults. */
export function resolveOptions(model: HpbModel | null, options: HpbOptions = {}, source = ""): ResolvedOptions {
  const cfg = model?.config;
  const o: ResolvedOptions = {
    theme: options.theme ?? cfg?.theme ?? DEFAULTS.theme,
    colWidth: clampNum(options.colWidth, 32, 200, DEFAULTS.colWidth),
    laneHeight: clampNum(options.laneHeight, 34, 200, DEFAULTS.laneHeight),
    showClosed: options.showClosed ?? cfg?.showClosed ?? DEFAULTS.showClosed,
    labels: options.labels ?? cfg?.labels ?? DEFAULTS.labels,
    fontFamily: options.fontFamily ?? DEFAULTS.fontFamily,
    padding: clampNum(options.padding, 0, 200, DEFAULTS.padding),
    showTitle: options.showTitle ?? DEFAULTS.showTitle,
    onError: options.onError ?? DEFAULTS.onError,
    idPrefix: sanitizePrefix(options.idPrefix) ?? `hpb-${hash(source || JSON.stringify(model?.events ?? []))}`,
  };
  if (options.ariaTitle !== undefined) o.ariaTitle = options.ariaTitle;
  if (!(THEME_NAMES as readonly string[]).includes(o.theme)) o.theme = "default";
  if (!(LABEL_MODES as readonly string[]).includes(o.labels)) o.labels = "full";
  return o;
}

export const THEME_NAMES = ["default", "mono", "dark", "auto"] as const;
export const LABEL_MODES = ["full", "ref", "none"] as const;

/**
 * Checks renderer options passed through the API (not the source text).
 * Returns one "E-OPTION" warning per bad value (line 0, col 0: not in the source);
 * the renderer then falls back to the default for that option.
 */
export function checkOptions(options: HpbOptions | undefined): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (!options || typeof options !== "object") return out;
  const warn = (message: string) => out.push({ severity: "warning", code: "E-OPTION", message, line: 0, col: 0 });
  const o = options as Record<string, unknown>;
  const oneOf = (key: string, allowed: readonly string[]) => {
    const v = o[key];
    if (v !== undefined && !allowed.includes(v as string)) {
      const hint = typeof v === "string" ? closestOption(v, allowed) : null;
      warn(`Invalid option ${key}: ${JSON.stringify(v)}; expected ${allowed.join(" | ")}.${hint ? ` Did you mean '${hint}'?` : ""} Using '${allowed[0]}'.`);
    }
  };
  oneOf("theme", THEME_NAMES);
  oneOf("labels", LABEL_MODES);
  const ranges: Array<[string, number, number]> = [
    ["colWidth", 32, 200],
    ["laneHeight", 34, 200],
    ["padding", 0, 200],
  ];
  for (const [key, min, max] of ranges) {
    const v = o[key];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) warn(`Invalid option ${key}: ${JSON.stringify(v)}; expected a number of px. Using the default.`);
    else if (v < min || v > max) warn(`Option ${key} = ${v} is out of range [${min}, ${max}]; it is clamped.`);
  }
  for (const key of ["showClosed", "showTitle"]) {
    const v = o[key];
    if (v !== undefined && typeof v !== "boolean") warn(`Invalid option ${key}: ${JSON.stringify(v)}; expected true or false.`);
  }
  if (o.onError !== undefined && o.onError !== "box" && o.onError !== "throw") warn(`Invalid option onError: ${JSON.stringify(o.onError)}; expected box | throw.`);
  return out;
}

function closestOption(v: string, allowed: readonly string[]): string | null {
  const s = v.toLowerCase();
  let best: string | null = null;
  let bestD = 3;
  for (const a of allowed) {
    // Small edit distance (typos such as "drak" or "mnoo").
    const dp = Array.from({ length: a.length + 1 }, (_, j) => j);
    for (let i = 1; i <= s.length; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= a.length; j++) {
        const tmp = dp[j];
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (s[i - 1] === a[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    if (dp[a.length] < bestD) {
      bestD = dp[a.length];
      best = a;
    }
  }
  return best;
}

function clampNum(v: unknown, min: number, max: number, dflt: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;
}

function sanitizePrefix(p: string | undefined): string | undefined {
  if (p === undefined) return undefined;
  const s = p.replace(/[^A-Za-z0-9_-]/g, "");
  return s ? (/^[A-Za-z]/.test(s) ? s : `h${s}`) : undefined;
}

/** Largest fork / merge corner offset, in columns (see the nesting offsets). */
const MAX_OFF = 0.95;

const ABOVE_TYPES: BranchType[] = ["improvement", "lab"];
const BELOW_TYPES: BranchType[] = ["issue", "task"];

export function branchSide(type: BranchType): 1 | -1 {
  return type === "improvement" || type === "lab" ? 1 : -1;
}

interface Draft {
  b: ModelBranch;
  state: LayoutBranch["state"];
  forkCol: number;
  startCol: number;
  termCol: number | null; // merge/discard terminal column
  mergeInto: ModelBaseline | null; // merge baseline (merged/awaiting)
  target: ModelBaseline | null;
  faded: ModelBaseline[];
  stepCols: number[];
  labelText: string | null;
  labelW: number;
  reasonW: number;
  lane: number;
  x1: number;
  x2: number;
}

/** Computes the pixel layout of a model. Pure and deterministic. */
export function layout(model: HpbModel, options: HpbOptions = {}): HpbLayout {
  const opt = resolveOptions(model, options);
  const c = opt.colWidth;
  const laneH = opt.laneHeight;
  const M = METRICS;
  const pad = opt.padding;

  const baselineById = new Map(model.baselines.map((b) => [b.id, b]));
  const lineById = new Map(model.lines.map((l) => [l.id, l]));

  // ---------------------------------------------------------------- visibility
  const hiddenMerged = new Map<string, number>();
  const visible = model.branches.filter((b) => {
    if (opt.showClosed) return true;
    if (b.end.kind === "discard") return false;
    if (b.end.kind === "merge") {
      const into = baselineById.get(b.end.baseline);
      if (into && into.status === "released") {
        hiddenMerged.set(into.id, (hiddenMerged.get(into.id) ?? 0) + 1);
        return false;
      }
    }
    return true;
  });
  const visibleIds = new Set(visible.map((b) => b.id));

  // ---------------------------------------------------------------- columns
  const columns: LayoutColumn[] = [];
  const width: number[] = [];
  const colOfSeq = new Map<number, number>();
  const closeColOf = new Map<string, number>();
  const pushCol = (kind: LayoutColumn["kind"], w: number, date?: DateValue, ref?: string): number => {
    const col: LayoutColumn = { index: columns.length, kind, x: 0 };
    if (date) col.date = date;
    if (ref !== undefined) col.ref = ref;
    columns.push(col);
    width.push(w);
    return col.index;
  };
  for (const e of model.events) {
    if ((e.kind === "open" || e.kind === "step" || e.kind === "merge" || e.kind === "discard") && !visibleIds.has(e.ref)) continue;
    if (e.kind === "release") {
      const closing = visible.some((b) => b.end.kind === "merge" && b.end.baseline === e.ref && b.end.seq === null);
      if (closing) closeColOf.set(e.ref, pushCol("close", 1));
    }
    colOfSeq.set(e.seq, pushCol(e.kind === "origin" ? "origin" : "event", 1, e.date, e.ref));
  }
  const lastHistoryCol = columns.length - 1;
  const planned = model.baselines
    .filter((b) => b.status === "planned")
    .sort((a, b) => (a.planOrder ?? 0) - (b.planOrder ?? 0));
  const drawNow =
    model.hasNow ||
    planned.length > 0 ||
    visible.some((b) => b.end.kind === "open" || (b.end.kind === "merge" && baselineById.get(b.end.baseline)?.status === "planned"));
  const nowCol = drawNow ? pushCol("now", columns.length === 0 ? 0 : 1) : -1;
  const plannedCol = new Map<string, number>();
  planned.forEach((b, i) => plannedCol.set(b.id, pushCol("planned", i === 0 ? 1.6 : 1, b.date, b.id)));

  const baselineCol = (b: ModelBaseline): number =>
    b.status === "planned" ? (plannedCol.get(b.id) as number) : (colOfSeq.get(b.seq as number) as number);

  // ---------------------------------------------------------------- legend
  const legendLabels: string[] = model.lines.map((l) => l.label);
  const usedTypes = new Set(visible.map((b) => b.type));
  for (const t of usedTypes) legendLabels.push(TYPE_LEGEND[t]);
  const legendTextW = Math.max(0, ...legendLabels.map((s) => Math.min(textWidth(s, M.font, true), 150)));
  const legendW = Math.max(92, legendTextW + 16);
  const legendX = pad;
  const guideX1 = legendX + legendW + 8;
  const firstX = guideX1 + 14 + 0.7 * c;

  // ---------------------------------------------------------------- x positions
  const X: number[] = [];
  {
    let x = firstX;
    for (let i = 0; i < columns.length; i++) {
      if (i > 0) x += width[i] * c;
      X.push(x);
    }
  }

  // Tags and their horizontal extents.
  interface TagInfo {
    b: ModelBaseline;
    col: number;
    tagW: number;
    caption?: { text: string; kind: "hardware" | "date"; w: number };
    left: number; // extent left of x
    right: number; // extent right of x
    gate: boolean;
  }
  const targetedBy = new Map<string, ModelBranch[]>();
  for (const b of visible) {
    if (b.end.kind === "open" && b.target) {
      const list = targetedBy.get(b.target) ?? [];
      list.push(b);
      targetedBy.set(b.target, list);
    }
  }
  const tagInfos: TagInfo[] = model.baselines
    .filter((b) => (b.status === "planned" ? plannedCol.has(b.id) : colOfSeq.has(b.seq as number)))
    .map((b) => {
      const col = baselineCol(b);
      const tagW = textWidth(b.id, M.tagFont, true) + 2 * M.tagPadX;
      let caption: TagInfo["caption"];
      if (b.kind === "hardware") caption = { text: "new ref.", kind: "hardware", w: textWidth("new ref.", M.font) + 4 };
      if (b.status === "planned" && b.date) {
        const t = formatDate(b.date);
        caption = { text: t, kind: "date", w: textWidth(t, M.font) + 4 };
      }
      const gate = b.status === "planned" && (targetedBy.get(b.id)?.length ?? 0) > 0;
      const badge = b.overdue || b.forced ? 15 : 0;
      const right = tagW / 2 + (caption ? caption.w + 3 : 0) + (gate ? 8 : 0);
      const left = Math.max(tagW / 2 + badge, gate ? 0.9 * c : 0, M.hwHalf);
      return { b, col, tagW, caption, left, right, gate };
    });

  // Spacing pass. Constraints [a, b, px]: X[b] - X[a] >= px.
  //  - consecutive baselines of the same line never overlap their tags/captions;
  //  - a branch label fits on its own lane run (before its rise or its NOW head),
  //    so no vertical of the same or a nested branch crosses the text.
  const labelOf = (b: ModelBranch): string | null => {
    if (opt.labels === "none") return null;
    if (opt.labels === "ref" || !b.title) return b.id;
    return `${b.id} ${b.title}`;
  };
  {
    const cons: Array<[number, number, number]> = [];
    for (const line of model.lines) {
      const list = tagInfos.filter((t) => t.b.line === line.id).sort((a, b) => a.col - b.col);
      for (let i = 1; i < list.length; i++) cons.push([list[i - 1].col, list[i].col, list[i - 1].right + list[i].left + 8]);
    }
    for (const b of visible) {
      const label = labelOf(b);
      if (!label) continue;
      const lw = textWidth(label, M.font) + 4;
      const startCol = colOfSeq.get(b.openSeq) as number;
      let endCol = -1;
      let tail = 0;
      if (b.end.kind === "merge") {
        const into = baselineById.get(b.end.baseline);
        if (into) {
          endCol = baselineCol(into);
          tail = MAX_OFF * c + 4;
        }
      } else if (b.end.kind === "open" && nowCol >= 0) {
        endCol = nowCol;
        tail = M.rHead + 4;
      }
      if (endCol > startCol) cons.push([startCol, endCol, lw - M.rEvent + tail]);
      // Verticals of other branches on the same side (drops from a later fork,
      // rises into a later merge) may pass through this lane: end the label first.
      {
        const above = b.type === "improvement" || b.type === "lab";
        const limit = endCol >= 0 ? endCol : Infinity;
        for (const o of visible) {
          if (o === b || o.line !== b.line) continue;
          if ((o.type === "improvement" || o.type === "lab") !== above) continue;
          const oFork = baselineById.get(o.fork);
          if (oFork && oFork.line === b.line) {
            const fc = baselineCol(oFork);
            if (fc > startCol && fc < limit) cons.push([startCol, fc, lw - M.rEvent + 4]);
          }
          if (o.end.kind === "merge") {
            const into = baselineById.get(o.end.baseline);
            if (into && into.line === b.line && into.status === "released") {
              const mc = baselineCol(into);
              const oStart = colOfSeq.get(o.openSeq) as number;
              if (mc > startCol && mc < limit && oStart < startCol) cons.push([startCol, mc, lw - M.rEvent + MAX_OFF * c + 4]);
            }
          }
        }
      }
      // Labels below the main line sit at the height of the collapsed-history
      // badges: keep the text clear of any badge of the same line it would cover.
      if (b.type === "issue" || b.type === "task") {
        for (const t of tagInfos) {
          if (t.b.line !== b.line || t.col <= startCol) continue;
          if (endCol >= 0 && t.col > endCol) continue;
          const count = t.b.collapsed + (hiddenMerged.get(t.b.id) ?? 0);
          if (count <= 0) continue;
          const r = Math.max(M.badgeR, textWidth(String(count), M.font, true) / 2 + 3);
          cons.push([startCol, t.col, lw - M.rEvent + r + 4]);
        }
      }
    }
    cons.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
    for (const [a, b, need] of cons) {
      const have = X[b] - X[a];
      if (have < need) {
        const d = need - have;
        for (let i = b; i < X.length; i++) X[i] += d;
      }
    }
  }
  columns.forEach((col, i) => (col.x = X[i]));
  const xNow = drawNow ? X[nowCol] : null;

  // ---------------------------------------------------------------- branch drafts
  const drafts: Draft[] = visible.map((b) => {
    const fork = baselineById.get(b.fork) as ModelBaseline;
    const forkCol = baselineCol(fork);
    const startCol = colOfSeq.get(b.openSeq) as number;
    let state: LayoutBranch["state"] = "open";
    let termCol: number | null = null;
    let mergeInto: ModelBaseline | null = null;
    let target: ModelBaseline | null = null;
    if (b.end.kind === "merge") {
      mergeInto = baselineById.get(b.end.baseline) as ModelBaseline;
      state = mergeInto.status === "released" ? "merged" : "awaiting";
      termCol = b.end.seq === null ? (closeColOf.get(mergeInto.id) as number) : (colOfSeq.get(b.end.seq) as number);
    } else if (b.end.kind === "discard") {
      state = "discarded";
      termCol = colOfSeq.get(b.end.seq) as number;
    } else if (b.target) {
      target = baselineById.get(b.target) ?? null;
      if (target && target.status === "planned") state = "targeted";
      else target = null;
    }
    const faded =
      drawNow && (state === "targeted" || state === "open")
        ? b.previousTargets
            .map((id) => baselineById.get(id))
            .filter((v): v is ModelBaseline => !!v && v.status === "planned" && v.id !== target?.id)
        : [];
    const labelText = labelOf(b);
    const reasonText = b.end.kind === "discard" ? b.end.reason : undefined;
    const d: Draft = {
      b,
      state,
      forkCol,
      startCol,
      termCol,
      mergeInto,
      target,
      faded: dedupe(faded),
      stepCols: b.steps.map((s) => colOfSeq.get(s.seq) as number),
      labelText,
      labelW: labelText ? textWidth(labelText, M.font) + 4 : 0,
      reasonW: reasonText ? textWidth(reasonText, M.font) + 4 : 0,
      lane: 0,
      x1: 0,
      x2: 0,
    };
    // Lane interval (px).
    const sx = X[startCol];
    d.x1 = X[forkCol] + 0.5 * c;
    let end = sx + M.rEvent;
    if (state === "merged" || state === "awaiting") end = X[baselineCol(mergeInto as ModelBaseline)] - 0.5 * c;
    else if (state === "discarded") end = X[termCol as number] + M.rEvent + (d.reasonW ? 4 + d.reasonW : 0);
    else if (state === "targeted") end = X[baselineCol(target as ModelBaseline)] - 0.5 * c;
    else end = (xNow ?? sx) + M.rHead;
    for (const f of d.faded) end = Math.max(end, X[baselineCol(f)] - 0.5 * c);
    if (state !== "targeted" && state !== "merged" && state !== "awaiting") end = Math.max(end, xNow !== null && state === "open" ? xNow + M.rHead : end);
    d.x2 = Math.max(end, sx - M.rEvent + d.labelW);
    return d;
  });

  // ---------------------------------------------------------------- lane packing
  // Per line, per side: improvements nearest above, labs beyond; issues nearest below, tasks beyond.
  const lanesOf = new Map<string, { type: BranchType; lane: number }[]>();
  for (const line of model.lines) {
    const lanes: { type: BranchType; lane: number }[] = [];
    for (const [types, sign] of [
      [ABOVE_TYPES, 1],
      [BELOW_TYPES, -1],
    ] as const) {
      let base = 0;
      for (const type of types) {
        const group = drafts.filter((d) => d.b.line === line.id && d.b.type === type);
        const packed = packIntervals(group.map((d) => ({ x1: d.x1, x2: d.x2, order: d.b.openSeq })), 10);
        let used = 0;
        group.forEach((d, i) => {
          d.lane = sign * (base + packed[i]);
          used = Math.max(used, packed[i]);
        });
        for (let k = 1; k <= used; k++) lanes.push({ type, lane: sign * (base + k) });
        base += used;
      }
    }
    lanesOf.set(line.id, lanes);
  }

  // ---------------------------------------------------------------- band order
  const order: ModelLine[] = [];
  {
    const children = new Map<string, ModelLine[]>();
    const roots: ModelLine[] = [];
    for (const l of model.lines) {
      if (l.parent && lineById.has(l.parent)) {
        const list = children.get(l.parent) ?? [];
        list.push(l);
        children.set(l.parent, list);
      } else roots.push(l);
    }
    const visit = (l: ModelLine) => {
      // Child lines are drawn above their parent (newest child on top).
      const ch = [...(children.get(l.id) ?? [])].reverse();
      for (const x of ch) visit(x);
      order.push(l);
    };
    for (const r of roots) visit(r);
  }

  // Notes (x positions only, rows packed per band).
  interface NoteDraft {
    line: string;
    ref: string;
    text: string;
    x: number;
    w: number;
    anchorX: number;
    anchorKind: "baseline" | "branch" | "line";
    row: number;
  }
  const noteDrafts: NoteDraft[] = [];
  for (const line of model.lines) {
    if (!line.notes || line.notes.length === 0) continue;
    const fb = line.forkBaseline ? baselineById.get(line.forkBaseline) : undefined;
    const ax = fb
      ? X[baselineCol(fb)]
      : line.originSeq >= 0 && colOfSeq.has(line.originSeq)
        ? X[colOfSeq.get(line.originSeq) as number]
        : firstX - 0.7 * c;
    for (const text of line.notes) {
      const w = textWidth(text, M.font) + 10;
      noteDrafts.push({ line: line.id, ref: line.id, text, x: ax - 10, w, anchorX: ax, anchorKind: "line", row: 0 });
    }
  }
  for (const t of tagInfos) {
    for (const text of t.b.notes) {
      const w = textWidth(text, M.font) + 10;
      noteDrafts.push({ line: t.b.line, ref: t.b.id, text, x: X[t.col] - 10, w, anchorX: X[t.col], anchorKind: "baseline", row: 0 });
    }
  }
  for (const d of drafts) {
    for (const text of d.b.notes) {
      const w = textWidth(text, M.font) + 10;
      const ax = X[d.startCol];
      noteDrafts.push({ line: d.b.line, ref: d.b.id, text, x: ax - 10, w, anchorX: ax, anchorKind: "branch", row: 0 });
    }
  }
  const noteRows = new Map<string, number>();
  for (const line of model.lines) {
    const list = noteDrafts.filter((n) => n.line === line.id).sort((a, b) => a.x - b.x);
    const packed = packIntervals(list.map((n, i) => ({ x1: n.x, x2: n.x + n.w, order: i })), 8);
    list.forEach((n, i) => (n.row = packed[i] - 1));
    noteRows.set(line.id, list.length ? Math.max(...packed) : 0);
  }

  // ---------------------------------------------------------------- y layout
  const hasTitle = opt.showTitle && !!model.title;
  const titleY = hasTitle ? pad + 13 : null;
  let cursor = pad + (hasTitle ? 26 : 0) + (drawNow ? 20 : 0);
  const bandOf = new Map<string, LayoutBand>();
  const bands: LayoutBand[] = [];
  const noteRowH = M.noteH + 6;
  order.forEach((line, i) => {
    const lanes = lanesOf.get(line.id) ?? [];
    const nAbove = lanes.filter((l) => l.lane > 0).length;
    const nBelow = lanes.filter((l) => l.lane < 0).length;
    const top = cursor;
    const mainY = nAbove > 0 ? top + 24 + nAbove * laneH : top + 38;
    let bottom = mainY + nBelow * laneH + (nBelow > 0 ? 20 : 30);
    const rows = noteRows.get(line.id) ?? 0;
    if (rows > 0) bottom += 6 + rows * noteRowH;
    const band: LayoutBand = {
      line: line.id,
      label: line.label,
      mainY,
      top,
      bottom,
      lanes: lanes
        .map((l) => ({ lane: l.lane, type: l.type, y: mainY - l.lane * laneH }))
        .sort((a, b) => b.lane - a.lane),
      startX: 0,
      solidEndX: 0,
      plannedEndX: null,
      eosX: null,
      origin: null,
      fork: null,
      separatorY: i < order.length - 1 ? bottom + 7 : null,
    };
    bands.push(band);
    bandOf.set(line.id, band);
    cursor = bottom + 14;
  });
  const laneY = (line: string, lane: number) => (bandOf.get(line) as LayoutBand).mainY - lane * laneH;

  // ---------------------------------------------------------------- baselines
  const baselines: LayoutBaseline[] = tagInfos.map((t) => {
    const b = t.b;
    const band = bandOf.get(b.line) as LayoutBand;
    const x = X[t.col];
    const y = band.mainY;
    const half = b.kind === "hardware" ? M.hwHalf : b.kind === "other" ? M.procHalf : M.rBaseline;
    const tagTop = y - half - M.tagGap - M.tagH;
    const lb: LayoutBaseline = {
      id: b.id,
      line: b.line,
      kind: b.kind,
      status: b.status,
      x,
      y,
      tag: { text: b.id, x, y: tagTop, width: t.tagW, height: M.tagH },
      overdue: b.overdue,
      forced: b.forced,
      collapsed: b.collapsed + (hiddenMerged.get(b.id) ?? 0),
    };
    if (b.date) lb.date = b.date;
    if (t.caption) lb.caption = { text: t.caption.text, x: x + t.tagW / 2 + 3, y: tagTop + M.tagH / 2, kind: t.caption.kind };
    return lb;
  });
  const lbById = new Map(baselines.map((b) => [b.id, b]));

  // ---------------------------------------------------------------- nesting offsets
  const dropOff = new Map<string, number>();
  const riseOff = new Map<string, number>(); // key `${branch}|${baseline}`
  {
    const groups = new Map<string, { key: string; dist: number; max: number }[]>();
    const add = (gk: string, key: string, dist: number, max: number) => {
      const list = groups.get(gk) ?? [];
      list.push({ key, dist, max });
      groups.set(gk, list);
    };
    for (const d of drafts) {
      const side = Math.sign(d.lane);
      const startGap = (X[d.startCol] - X[d.forkCol] - M.rEvent - 3) / c;
      add(`drop|${d.b.fork}|${side}`, d.b.id, Math.abs(d.lane), startGap);
    }
    const groupsR = new Map<string, { key: string; dist: number; max: number }[]>();
    const addR = (gk: string, key: string, dist: number, max: number) => {
      const list = groupsR.get(gk) ?? [];
      list.push({ key, dist, max });
      groupsR.set(gk, list);
    };
    for (const d of drafts) {
      const y = laneY(d.b.line, d.lane);
      const into = [d.mergeInto, d.target, ...d.faded].filter((v): v is ModelBaseline => !!v);
      for (const v of into) {
        const lb = lbById.get(v.id);
        if (!lb) continue;
        const fromX =
          d.state === "merged" || d.state === "awaiting"
            ? X[d.termCol as number] + M.rEvent + 3
            : (xNow ?? X[d.startCol]) + M.rHead + 2;
        addR(`rise|${v.id}|${Math.sign(lb.y - y)}`, `${d.b.id}|${v.id}`, Math.abs(lb.y - y), (lb.x - fromX) / c);
      }
    }
    const assign = (gs: Map<string, { key: string; dist: number; max: number }[]>, out: Map<string, number>) => {
      for (const list of gs.values()) {
        list.sort((a, b) => b.dist - a.dist || (a.key < b.key ? -1 : 1));
        // Consecutive forks (merges) at the same baseline are spread by 0.15
        // column (about 7 px), like `forkoff` in hpb.sty, so the rounded corners
        // never melt into one knot.
        list.forEach((e, k) => {
          let off = Math.min(0.5 + 0.15 * k, MAX_OFF);
          off = Math.max(0.22, Math.min(off, e.max));
          out.set(e.key, off);
        });
      }
    };
    assign(groups, dropOff);
    assign(groupsR, riseOff);
  }

  // ---------------------------------------------------------------- branches
  const branches: LayoutBranch[] = drafts.map((d) => {
    const forkLb = lbById.get(d.b.fork) as LayoutBaseline;
    const y = laneY(d.b.line, d.lane);
    const sx = X[d.startCol];
    const dropX = forkLb.x + (dropOff.get(d.b.id) ?? 0.5) * c;
    const solid: LayoutPoint[] = [
      { x: forkLb.x, y: forkLb.y },
      { x: dropX, y: forkLb.y },
      { x: dropX, y },
    ];
    const riseTo = (v: ModelBaseline, fromX: number): LayoutPoint[] => {
      const lb = lbById.get(v.id) as LayoutBaseline;
      const rx = lb.x - (riseOff.get(`${d.b.id}|${v.id}`) ?? 0.5) * c;
      return [
        { x: fromX, y },
        { x: rx, y },
        { x: rx, y: lb.y },
        { x: lb.x, y: lb.y },
      ];
    };
    let dashed: LayoutPoint[] | null = null;
    let terminal: LayoutBranch["terminal"] = null;
    if (d.state === "merged") {
      const tx = X[d.termCol as number];
      solid.push(...riseTo(d.mergeInto as ModelBaseline, tx).slice(1));
      terminal = { x: tx, y, kind: "merge" };
    } else if (d.state === "awaiting") {
      const tx = X[d.termCol as number];
      solid.push({ x: tx, y });
      dashed = riseTo(d.mergeInto as ModelBaseline, tx);
      terminal = { x: tx, y, kind: "merge" };
    } else if (d.state === "discarded") {
      const tx = X[d.termCol as number];
      solid.push({ x: tx, y });
      terminal = { x: tx, y, kind: "discard" };
    } else {
      const hx = xNow ?? sx;
      solid.push({ x: hx, y });
      terminal = { x: hx, y, kind: "open" };
      if (d.state === "targeted") dashed = riseTo(d.target as ModelBaseline, hx);
    }
    const faded = d.faded.map((v) => riseTo(v, xNow ?? sx));
    const lb: LayoutBranch = {
      id: d.b.id,
      type: d.b.type,
      line: d.b.line,
      lane: d.lane,
      y,
      fork: d.b.fork,
      state: d.state,
      solid: simplify(solid),
      dashed: dashed ? simplify(dashed) : null,
      faded: faded.map(simplify),
      start: { x: sx, y },
      steps: d.b.steps.map((s, i) => {
        const st: LayoutBranch["steps"][number] = { x: X[d.stepCols[i]], y, state: s.state };
        if (s.text !== undefined) st.text = s.text;
        return st;
      }),
      terminal,
      label: d.labelText ? { text: d.labelText, x: sx - M.rEvent, y: y - 11, width: d.labelW } : null,
      reason:
        d.b.end.kind === "discard" && d.b.end.reason
          ? { text: d.b.end.reason, x: (terminal as LayoutPoint).x + M.rEvent + 5, y: y + 3.5 }
          : null,
      span: { x1: d.x1, x2: d.x2 },
    };
    if (d.b.title !== undefined) lb.title = d.b.title;
    if (d.mergeInto) lb.mergeInto = d.mergeInto.id;
    if (d.target) lb.target = d.target.id;
    return lb;
  });

  // Gates around planned baselines with targeted branches.
  for (const t of tagInfos) {
    if (!t.gate) continue;
    const lb = lbById.get(t.b.id) as LayoutBaseline;
    const ys = branches.filter((b) => b.target === t.b.id).map((b) => b.y);
    const y1 = Math.min(lb.tag.y - 6, ...ys.map((y) => y - 16));
    const y2 = Math.max(lb.y + 16, ...ys.map((y) => y + 16)) + 16;
    lb.gate = { x1: lb.x - 0.9 * c, y1, x2: lb.x + t.right, y2, label: `gate ${t.b.id}` };
  }

  // ---------------------------------------------------------------- main lines
  const lastX = lastHistoryCol >= 0 ? X[lastHistoryCol] : firstX;
  for (const band of bands) {
    const line = lineById.get(band.line) as ModelLine;
    const forkB = line.forkBaseline ? lbById.get(line.forkBaseline) : undefined;
    if (forkB && line.parent && bandOf.has(line.parent)) {
      band.startX = forkB.x;
      band.fork = { x: forkB.x, fromY: (bandOf.get(line.parent) as LayoutBand).mainY, toY: band.mainY };
    } else if (forkB) {
      band.startX = forkB.x;
    } else {
      const ox = line.originSeq >= 0 && colOfSeq.has(line.originSeq) ? X[colOfSeq.get(line.originSeq) as number] : firstX - 0.7 * c;
      band.startX = ox;
      band.origin = { x: ox, y: band.mainY };
    }
    if (line.eos && colOfSeq.has(line.eos.seq)) {
      band.eosX = X[colOfSeq.get(line.eos.seq) as number];
      band.solidEndX = band.eosX;
    } else {
      band.solidEndX = xNow ?? lastX + 0.6 * c;
      const pl = baselines.filter((b) => b.line === band.line && b.status === "planned");
      if (drawNow && pl.length) band.plannedEndX = Math.max(...pl.map((b) => b.x));
    }
  }

  // ---------------------------------------------------------------- notes
  const notes: LayoutNote[] = noteDrafts.map((nd) => {
    const band = bandOf.get(nd.line) as LayoutBand;
    const lanesBottom = band.mainY + Math.max(0, ...band.lanes.map((l) => -l.lane)) * laneH;
    const rowsTop = lanesBottom + (band.lanes.some((l) => l.lane < 0) ? 22 : 32);
    const y = rowsTop + nd.row * noteRowH;
    let anchor: LayoutPoint = { x: nd.anchorX, y: band.mainY };
    if (nd.anchorKind === "branch") {
      const br = branches.find((b) => b.id === nd.ref);
      if (br) anchor = { x: br.start.x, y: br.start.y };
    }
    return { text: nd.text, x: nd.x, y, width: nd.w, height: M.noteH, anchor, ref: nd.ref };
  });

  // ---------------------------------------------------------------- right edge
  const rights: number[] = [lastX + 0.6 * c + 24, firstX + c];
  if (xNow !== null) rights.push(xNow + 30);
  for (const t of tagInfos) rights.push(X[t.col] + t.right + 6);
  for (const b of branches) {
    rights.push(b.span.x2 + 6);
    if (b.label) rights.push(b.label.x + b.label.width + 4);
  }
  for (const nt of notes) rights.push(nt.x + nt.width + 4);
  for (const band of bands) if (band.eosX !== null) rights.push(band.eosX + 8 + textWidth("EoS", M.font, true) + 4);
  if (hasTitle) rights.push(pad + textWidth(model.title as string, 13, true));
  const guideX2 = Math.max(...rights) + 18;

  // ---------------------------------------------------------------- NOW, axis, size
  const lastBand = bands[bands.length - 1];
  const firstBand = bands[0];
  const now = xNow !== null && firstBand ? { x: xNow, y1: firstBand.top - 2, y2: lastBand.bottom - 4 } : null;

  let axis: HpbLayout["axis"] = null;
  const dated = columns.filter((col) => col.date && (col.kind === "event" || col.kind === "planned"));
  let bottomY = lastBand ? lastBand.bottom : cursor;
  if (dated.length > 0) {
    const ay = bottomY + 12;
    const ticks: LayoutTick[] = [];
    let lastMonth = -Infinity;
    let lastYear = NaN;
    let lastTickRight = -Infinity;
    for (const col of dated) {
      const d = col.date as DateValue;
      const mi = d.year * 12 + d.month;
      if (mi <= lastMonth) continue;
      const text = d.year !== lastYear ? `${monthName(d.month)} ${d.year}` : monthName(d.month);
      const w = textWidth(text, M.font);
      if (col.x - w / 2 < lastTickRight + 6) continue;
      ticks.push({ x: col.x, text });
      lastMonth = mi;
      lastYear = d.year;
      lastTickRight = col.x + w / 2;
    }
    axis = { y: ay, x1: Math.min(...bands.map((b) => b.startX)), x2: guideX2 - 26, ticks };
    bottomY = ay + 26;
  }

  return {
    width: Math.ceil(guideX2 + pad),
    height: Math.ceil(bottomY + pad),
    ...(model.title !== undefined ? { title: model.title } : {}),
    options: opt,
    colWidth: c,
    laneHeight: laneH,
    columns,
    legend: { x: legendX, width: legendW },
    guideX1,
    guideX2,
    bands,
    baselines,
    branches,
    notes,
    now,
    axis,
    titleY,
    diagnostics: model.diagnostics,
  };
}

/**
 * Greedy, stable interval partitioning: each interval takes the first lane
 * (nearest to the main line) whose previous interval ended before it starts.
 * Returns the lane (1..n) of each interval in input order.
 */
export function packIntervals(intervals: { x1: number; x2: number; order: number }[], gap: number): number[] {
  const idx = intervals.map((iv, i) => ({ ...iv, i })).sort((a, b) => a.x1 - b.x1 || a.order - b.order);
  const ends: number[] = [];
  const out = new Array<number>(intervals.length).fill(1);
  for (const iv of idx) {
    let lane = ends.findIndex((e) => e + gap <= iv.x1);
    if (lane < 0) {
      lane = ends.length;
      ends.push(iv.x2);
    } else ends[lane] = iv.x2;
    out[iv.i] = lane + 1;
  }
  return out;
}

function simplify(points: LayoutPoint[]): LayoutPoint[] {
  const out: LayoutPoint[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      const collinear = (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - p.x) < 0.01) || (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - p.y) < 0.01);
      if (collinear) {
        out[out.length - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

function dedupe<T>(list: T[]): T[] {
  return [...new Set(list)];
}

export function formatDate(d: DateValue): string {
  return d.day ? `${d.day} ${monthName(d.month)} ${d.year}` : `${monthName(d.month)} ${d.year}`;
}

export { dateKey };
