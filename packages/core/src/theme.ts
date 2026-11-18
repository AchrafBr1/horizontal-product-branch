/**
 * Themes. The default palette is the HPB notation palette (hpb.sty).
 */
import type { BranchType, ThemeName } from "./types";

export interface HpbTheme {
  name: ThemeName;
  background: string;
  /** Outlines, paths and main lines. */
  ink: string;
  /** Text drawn on the background (labels, captions). */
  text: string;
  /** Text drawn on coloured fills (tags, legend, letters). */
  nodeText: string;
  /** Halo behind labels. */
  halo: string;
  main: string;
  improvement: string;
  issue: string;
  task: string;
  lab: string;
  hardware: string;
  hardwareInk: string;
  discarded: string;
  discardedInk: string;
  guide: string;
  now: string;
  nowText: string;
  overdue: string;
  pass: string;
  fail: string;
  warn: string;
  muted: string;
  /** Fill of hollow glyphs (planned baselines, open heads, todo steps). */
  hollow: string;
  gateFill: string;
  gateOpacity: number;
  badge: string;
  badgeText: string;
  calloutFrame: string;
}

const DEFAULT: HpbTheme = {
  name: "default",
  background: "#FFFFFF",
  ink: "#374151",
  text: "#374151",
  nodeText: "#374151",
  halo: "#FFFFFF",
  main: "#BAE6FD",
  improvement: "#C4B5FD",
  issue: "#FB8A6E",
  task: "#6EE7B7",
  lab: "#5EEAD4",
  hardware: "#A5B4FC",
  hardwareInk: "#3730A3",
  discarded: "#E5E7EB",
  discardedInk: "#9CA3AF",
  guide: "#D1D5DB",
  now: "#0EA5E9",
  nowText: "#FFFFFF",
  overdue: "#DC2626",
  pass: "#16A34A",
  fail: "#DC2626",
  warn: "#D97706",
  muted: "#6B7280",
  hollow: "#FFFFFF",
  gateFill: "#BAE6FD",
  gateOpacity: 0.22,
  badge: "#374151",
  badgeText: "#FFFFFF",
  calloutFrame: "#9CA3AF",
};

const MONO: HpbTheme = {
  ...DEFAULT,
  name: "mono",
  ink: "#2B2B2B",
  text: "#222222",
  nodeText: "#111111",
  main: "#F2F2F2",
  improvement: "#E0E0E0",
  issue: "#C8C8C8",
  task: "#F7F7F7",
  lab: "#EBEBEB",
  hardware: "#D0D0D0",
  hardwareInk: "#111111",
  discarded: "#FFFFFF",
  discardedInk: "#9E9E9E",
  guide: "#D4D4D4",
  now: "#4A4A4A",
  overdue: "#111111",
  pass: "#111111",
  fail: "#111111",
  warn: "#111111",
  muted: "#5C5C5C",
  gateFill: "#E6E6E6",
  gateOpacity: 0.35,
  badge: "#2B2B2B",
  calloutFrame: "#9E9E9E",
};

const DARK: HpbTheme = {
  ...DEFAULT,
  name: "dark",
  background: "#0F172A",
  ink: "#CBD5E1",
  text: "#E2E8F0",
  nodeText: "#1F2937",
  halo: "#0F172A",
  guide: "#475569",
  discarded: "#334155",
  discardedInk: "#64748B",
  muted: "#94A3B8",
  hollow: "#0F172A",
  hardwareInk: "#A5B4FC",
  gateFill: "#38BDF8",
  gateOpacity: 0.12,
  badge: "#E2E8F0",
  badgeText: "#0F172A",
  calloutFrame: "#64748B",
};

/** Palettes of the fixed themes. "auto" uses `default` and `dark` through CSS (see svg.ts). */
export const themes: Readonly<Record<Exclude<ThemeName, "auto">, Readonly<HpbTheme>>> = {
  default: DEFAULT,
  mono: MONO,
  dark: DARK,
};

/** Colour keys of a theme (every key except `name` and `gateOpacity`). */
export const COLOR_KEYS = (Object.keys(DEFAULT) as (keyof HpbTheme)[]).filter(
  (k): k is Exclude<keyof HpbTheme, "name" | "gateOpacity"> => k !== "name" && k !== "gateOpacity"
);

export function typeColor(theme: HpbTheme, type: BranchType): string {
  return theme[type];
}

export const TYPE_LETTER: Record<BranchType, string> = {
  improvement: "I",
  issue: "X",
  task: "T",
  lab: "L",
};

export const TYPE_LEGEND: Record<BranchType, string> = {
  improvement: "Improvement (I)",
  issue: "Issue (X)",
  task: "Task (T)",
  lab: "Lab (L)",
};
