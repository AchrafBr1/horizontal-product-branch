/**
 * Public types of @hpb/core (HPB Markup v1.0).
 * Copyright (c) 2026 Achraf Bouchtarouif El Khiat. MIT License.
 */

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export type Severity = "error" | "warning" | "info";

/** A problem found while parsing or applying the model rules. Lines and columns are 1-based. */
export interface Diagnostic {
  severity: Severity;
  /**
   * Stable code, e.g. "E-SYNTAX", "R1" ... "R7" (the HPB rule that is violated),
   * "W-DATE-ORDER", or "E-OPTION" (a bad renderer option; line 0, col 0).
   */
  code: string;
  message: string;
  line: number;
  col: number;
  /** Column just after the offending token (1-based, exclusive), when known. */
  endCol?: number;
}

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

export interface Loc {
  line: number;
  col: number;
  endCol: number;
}

export interface Ident {
  value: string;
  loc: Loc;
}

export interface DateValue {
  year: number;
  month: number; // 1..12
  day?: number; // 1..31
  raw: string; // "2026-01" or "2026-01-15"
  loc: Loc;
}

export type BaselineKind = "firmware" | "software" | "hardware" | "other";
export type BranchType = "improvement" | "issue" | "task" | "lab";
export type StepState = "done" | "todo" | "pass" | "fail";

export interface HeaderStmt { type: "header"; title?: string; loc: Loc }
export interface ConfigStmt { type: "config"; key: Ident; value: Ident; loc: Loc }
export interface LineStmt { type: "line"; id: Ident; label?: string; from?: Ident; loc: Loc }
export interface UseStmt { type: "use"; id: Ident; loc: Loc }
export interface ReleaseStmt {
  type: "release";
  id: Ident;
  kind?: BaselineKind;
  date?: DateValue;
  merges: Ident[];
  force: boolean;
  on?: Ident;
  loc: Loc;
}
export interface PlanStmt {
  type: "plan";
  id: Ident;
  kind?: BaselineKind;
  date?: DateValue;
  targets: Ident[];
  on?: Ident;
  loc: Loc;
}
export interface BranchStmt {
  type: "branch";
  branchType: BranchType;
  id: Ident;
  title?: string;
  from?: Ident;
  on?: Ident;
  target?: Ident;
  date?: DateValue;
  loc: Loc;
}
export interface StepStmt { type: "step"; id: Ident; state: StepState; text?: string; date?: DateValue; loc: Loc }
export interface MergeStmt { type: "merge"; id: Ident; into: Ident; date?: DateValue; loc: Loc }
export interface DiscardStmt { type: "discard"; id: Ident; reason?: string; date?: DateValue; loc: Loc }
export interface TargetStmt { type: "target"; id: Ident; version: Ident; loc: Loc }
export interface NowStmt { type: "now"; loc: Loc }
export interface EosStmt { type: "eos"; line?: Ident; date?: DateValue; loc: Loc }
export interface CollapseStmt { type: "collapse"; version: Ident; count: number; loc: Loc }
export interface NoteStmt { type: "note"; target: Ident; text: string; loc: Loc }

export type Statement =
  | HeaderStmt
  | ConfigStmt
  | LineStmt
  | UseStmt
  | ReleaseStmt
  | PlanStmt
  | BranchStmt
  | StepStmt
  | MergeStmt
  | DiscardStmt
  | TargetStmt
  | NowStmt
  | EosStmt
  | CollapseStmt
  | NoteStmt;

export interface HpbAst {
  type: "document";
  title?: string;
  statements: Statement[];
}

export interface ParseResult {
  ast: HpbAst;
  diagnostics: Diagnostic[];
}

// ---------------------------------------------------------------------------
// Model (after the rule checks)
// ---------------------------------------------------------------------------

/** "auto" follows the reader's light / dark preference (prefers-color-scheme) with CSS inside the SVG. */
export type ThemeName = "default" | "mono" | "dark" | "auto";
export type LabelMode = "full" | "ref" | "none";
export type TimeMode = "ordinal" | "linear";

export interface HpbConfig {
  time: TimeMode;
  labels: LabelMode;
  theme: ThemeName;
  showClosed: boolean;
}

export interface ModelLine {
  id: string;
  label: string;
  /** Declaration order (0 = first line declared, the default line). */
  index: number;
  /** Parent line id when this line is a line fork. */
  parent?: string;
  /** Hardware baseline that is the origin of this (child) line. */
  forkBaseline?: string;
  /** History sequence of the line origin; -1 = before the first event. */
  originSeq: number;
  /** End of support (history sequence). */
  eos?: { seq: number; date?: DateValue };
  /** Notes attached to the line itself (rule R7). */
  notes: string[];
}

export interface ModelBaseline {
  id: string;
  line: string;
  kind: BaselineKind;
  status: "released" | "planned";
  /** History sequence of the release event (released baselines). */
  seq: number | null;
  /** Order among planned baselines (planned baselines). */
  planOrder: number | null;
  date?: DateValue;
  /** Released with `force` while targeted branches were still open (R4 overridden). */
  forced: boolean;
  /** Overdue planned baseline (target date earlier than the last historical date). */
  overdue: boolean;
  /** Collapsed (hidden) merged branches shown as a badge. */
  collapsed: number;
  notes: string[];
}

export type BranchEnd =
  | { kind: "open" }
  /** seq = history sequence of an explicit `merge` statement; null = merged at the release itself. */
  | { kind: "merge"; baseline: string; seq: number | null }
  | { kind: "discard"; seq: number; reason?: string };

export interface ModelStep {
  seq: number;
  state: StepState;
  text?: string;
  date?: DateValue;
}

export interface ModelBranch {
  id: string;
  type: BranchType;
  title?: string;
  line: string;
  /** Fork baseline (rule R1). */
  fork: string;
  openSeq: number;
  date?: DateValue;
  steps: ModelStep[];
  end: BranchEnd;
  /** Current target (planned baseline) of an open branch. */
  target?: string;
  /** Former targets (drawn faded). */
  previousTargets: string[];
  notes: string[];
}

export type ModelEventKind = "origin" | "release" | "open" | "step" | "merge" | "discard" | "eos";

export interface ModelEvent {
  seq: number;
  kind: ModelEventKind;
  /** Baseline id, branch id or line id depending on kind. */
  ref: string;
  line: string;
  date?: DateValue;
}

export interface HpbModel {
  title?: string;
  config: HpbConfig;
  lines: ModelLine[];
  baselines: ModelBaseline[];
  branches: ModelBranch[];
  /** History events in statement (time) order. */
  events: ModelEvent[];
  /** True when the source contains an explicit `now`. */
  hasNow: boolean;
  diagnostics: Diagnostic[];
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface HpbOptions {
  theme?: ThemeName;
  /** Width of one ordinal column in px (default 48). */
  colWidth?: number;
  /** Height of one lane in px (default 40). */
  laneHeight?: number;
  /** Show merged/discarded branches (default true; `config showClosed` in the source). */
  showClosed?: boolean;
  labels?: LabelMode;
  fontFamily?: string;
  /** Outer padding in px (default 16). */
  padding?: number;
  /** Accessible title (defaults to the document title). */
  ariaTitle?: string;
  /**
   * Prefix for element ids (default: derived from a hash of the source, deterministic).
   * Pass a unique value when one page shows the same source more than once.
   */
  idPrefix?: string;
  /** Render the document title above the diagram (default true). */
  showTitle?: boolean;
  /** What renderSVG does when the source has errors: draw an error box (default) or throw. */
  onError?: "box" | "throw";
}

export type ResolvedOptions = Required<Omit<HpbOptions, "ariaTitle" | "idPrefix">> & {
  ariaTitle?: string;
  idPrefix: string;
};

// ---------------------------------------------------------------------------
// Layout (pixel geometry, consumed by the renderer)
// ---------------------------------------------------------------------------

export type ColumnKind = "origin" | "event" | "close" | "now" | "planned";

export interface LayoutColumn {
  index: number;
  kind: ColumnKind;
  x: number;
  date?: DateValue;
  /** Event or baseline reference that created the column. */
  ref?: string;
}

export interface LayoutLane {
  /** Lane number relative to the line's main line (+ above, - below). */
  lane: number;
  type: BranchType;
  y: number;
}

export interface LayoutBand {
  line: string;
  label: string;
  mainY: number;
  top: number;
  bottom: number;
  lanes: LayoutLane[];
  /** x where the main line starts. */
  startX: number;
  /** x where the solid main line ends (NOW, EoS or last event). */
  solidEndX: number;
  /** x of the last planned baseline of the line (dashed segment), if any. */
  plannedEndX: number | null;
  /** x of the EoS bar, if any. */
  eosX: number | null;
  /** Origin dot (lines that do not start from a line fork). */
  origin: { x: number; y: number } | null;
  /** Line-fork connector (child lines). */
  fork: { x: number; fromY: number; toY: number } | null;
  /** y of the separator rule drawn under this band (null for the last band). */
  separatorY: number | null;
}

export interface LayoutTag {
  text: string;
  x: number; // center
  y: number; // top
  width: number;
  height: number;
}

export interface LayoutBaseline {
  id: string;
  line: string;
  kind: BaselineKind;
  status: "released" | "planned";
  x: number;
  y: number;
  tag: LayoutTag;
  /** Caption right of the tag ("new ref." or the planned date). */
  caption?: { text: string; x: number; y: number; kind: "hardware" | "date" };
  overdue: boolean;
  forced: boolean;
  collapsed: number;
  date?: DateValue;
  /** Gate band drawn around a planned baseline with targeted branches. */
  gate?: { x1: number; y1: number; x2: number; y2: number; label: string };
}

export type BranchState = "merged" | "awaiting" | "open" | "targeted" | "discarded";

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface LayoutBranch {
  id: string;
  type: BranchType;
  title?: string;
  line: string;
  lane: number;
  y: number;
  fork: string;
  state: BranchState;
  mergeInto?: string;
  target?: string;
  /** Orthogonal polyline of the solid path (rounded at render time). */
  solid: LayoutPoint[];
  /** Dashed continuation into a planned baseline. */
  dashed: LayoutPoint[] | null;
  /** Faded dashed continuations into former targets. */
  faded: LayoutPoint[][];
  start: LayoutPoint;
  steps: Array<LayoutPoint & { state: StepState; text?: string }>;
  terminal: (LayoutPoint & { kind: "merge" | "discard" | "open" }) | null;
  label: { text: string; x: number; y: number; width: number } | null;
  reason: { text: string; x: number; y: number } | null;
  /** Horizontal interval occupied on the lane (px), used by the lane packer. */
  span: { x1: number; x2: number };
}

export interface LayoutNote {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  anchor: LayoutPoint;
  ref: string;
}

export interface LayoutTick {
  x: number;
  text: string;
}

export interface HpbLayout {
  width: number;
  height: number;
  title?: string;
  options: ResolvedOptions;
  colWidth: number;
  laneHeight: number;
  columns: LayoutColumn[];
  legend: { x: number; width: number };
  guideX1: number;
  guideX2: number;
  bands: LayoutBand[];
  baselines: LayoutBaseline[];
  branches: LayoutBranch[];
  notes: LayoutNote[];
  now: { x: number; y1: number; y2: number } | null;
  axis: { y: number; x1: number; x2: number; ticks: LayoutTick[] } | null;
  titleY: number | null;
  diagnostics: Diagnostic[];
}
