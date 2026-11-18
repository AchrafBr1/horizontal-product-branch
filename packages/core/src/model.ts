/**
 * Model builder: turns the AST into the HPB model and checks the HPB rules
 * that can be decided from the text alone:
 *   R1  a branch forks from the latest RELEASED baseline of its line (unless `from`)
 *   R2  a branch ends in exactly one terminal (merge or discard) or stays open;
 *       a discard carries a rationale (warning when it is missing)
 *   R3  a branch never merges into a baseline older than its fork
 *   R4  a planned baseline is not released while targeted branches are open
 *       (unless `release ... force`)
 *   R5  a new line starts only from a released hardware baseline (line fork);
 *       work after the end of support of a line is flagged (warning)
 *   R6  a branch has exactly one known type, a step one known state (parser)
 *   R7  a note is attached to exactly one existing line, baseline or branch
 * plus the structural checks (unknown ids, duplicates, statements after NOW).
 * What cannot be checked from text (verification evidence, dependencies,
 * launch bundles, append-only history) is listed in docs/language.md.
 */
import type {
  BaselineKind,
  DateValue,
  Diagnostic,
  HpbAst,
  HpbConfig,
  HpbModel,
  Ident,
  LabelMode,
  Loc,
  ModelBaseline,
  ModelBranch,
  ModelEvent,
  ModelLine,
  Statement,
  ThemeName,
  TimeMode,
} from "./types";

const DEFAULT_CONFIG: HpbConfig = { time: "ordinal", labels: "full", theme: "default", showClosed: true };

export function dateKey(d: DateValue): number {
  return d.year * 10000 + d.month * 100 + (d.day ?? 0);
}

const HISTORY_STATEMENTS = new Set(["release", "branch", "step", "merge", "discard", "eos", "line"]);

/** Builds the HPB model from an AST, checking rules R1-R7 where the text allows. Never throws. */
export function buildModel(ast: HpbAst): HpbModel {
  const diags: Diagnostic[] = [];
  const err = (code: string, message: string, loc: Loc, severity: Diagnostic["severity"] = "error") =>
    diags.push({ severity, code, message, line: loc.line, col: loc.col, endCol: loc.endCol });

  const config: HpbConfig = { ...DEFAULT_CONFIG };
  const lines = new Map<string, ModelLine>();
  const baselines = new Map<string, ModelBaseline>();
  const branches = new Map<string, ModelBranch>();
  const events: ModelEvent[] = [];
  let seq = 0;
  let planOrder = 0;
  let hasNow = false;
  let current: string | null = null;
  let lastDate: DateValue | null = null;
  const statements: Statement[] = ast?.statements ?? [];
  /** Where each id was first defined, for precise duplicate messages. */
  const defs = new Map<string, { kind: "line" | "baseline" | "branch"; line: number }>();
  const defKey = (id: string, kind: "line" | "baseline" | "branch") => `${kind === "line" ? "L" : "N"}:${id}`;
  const define = (id: string, kind: "line" | "baseline" | "branch", loc: Loc) => {
    if (!defs.has(defKey(id, kind))) defs.set(defKey(id, kind), { kind, line: loc.line });
  };
  const usedBy = (id: string): string => {
    const d = defs.get(`N:${id}`);
    return d ? ` by ${d.kind} ${id} (line ${d.line})` : "";
  };
  /** Branch ids whose opening statement was rejected: later references stay silent. */
  const rejected = new Set<string>();

  // --- pre-scan: line forks relocate their hardware baseline to the child line
  const childOf = new Map<string, string>(); // baseline id -> child line id
  const hwParent = new Map<string, string>(); // hardware baseline id -> line it was released on
  for (const s of statements) {
    if (s.type === "line" && s.from) childOf.set(s.from.value, s.id.value);
  }

  const ensureLine = (id: string, label?: string, decl = false): ModelLine => {
    let l = lines.get(id);
    if (!l) {
      l = { id, label: label ?? id, index: lines.size, originSeq: decl && seq > 0 ? -2 : -1, notes: [] };
      lines.set(id, l);
    } else if (label !== undefined) l.label = label;
    return l;
  };
  const currentLine = (loc: Loc): string => {
    if (current) return current;
    current = ensureLine("main", "Main").id;
    void loc;
    return current;
  };
  const resolveLine = (on: Ident | undefined, loc: Loc): string => {
    if (!on) return currentLine(loc);
    if (!lines.has(on.value)) {
      err("E-UNKNOWN-LINE", `Unknown line '${on.value}'. Declare it first with: line ${on.value} "Label"`, on.loc);
      return currentLine(loc);
    }
    return on.value;
  };
  const checkDate = (d: DateValue | undefined) => {
    if (!d) return;
    if (lastDate && dateKey(d) < dateKey(lastDate)) {
      err(
        "W-DATE-ORDER",
        `Date @${d.raw} is earlier than a previous date (@${lastDate.raw}). Statement order is time order; dates should not decrease.`,
        d.loc,
        "warning"
      );
    } else lastDate = d;
  };
  const pushEvent = (kind: ModelEvent["kind"], ref: string, line: string, date?: DateValue): number => {
    checkDate(date);
    const e: ModelEvent = { seq: seq++, kind, ref, line };
    if (date) e.date = date;
    events.push(e);
    return e.seq;
  };
  const latestReleased = (line: string): ModelBaseline | null => {
    let best: ModelBaseline | null = null;
    for (const b of baselines.values()) {
      if (b.line === line && b.status === "released" && b.seq !== null && (!best || b.seq > (best.seq as number))) best = b;
    }
    return best;
  };
  const getBranch = (id: Ident): ModelBranch | null => {
    const b = branches.get(id.value);
    if (!b) {
      if (rejected.has(id.value)) return null; // already reported where it was opened
      if (baselines.has(id.value)) {
        err("E-UNKNOWN-BRANCH", `'${id.value}' is a baseline${usedBy(id.value)}, not a branch.`, id.loc);
      } else {
        err("E-UNKNOWN-BRANCH", `Unknown branch '${id.value}'. Open it first, e.g.: issue ${id.value} "Title"`, id.loc);
      }
      return null;
    }
    return b;
  };
  /** Drops repeated ids of a `merges` / `targets` list (reported at the second occurrence). */
  const uniqueList = (list: Ident[], what: string): Ident[] => {
    const seen = new Set<string>();
    return list.filter((x) => {
      if (!seen.has(x.value)) {
        seen.add(x.value);
        return true;
      }
      err("E-DUP-IN-LIST", `'${x.value}' is listed twice after '${what}'.`, x.loc);
      return false;
    });
  };
  const endName = (b: ModelBranch) =>
    b.end.kind === "merge" ? `merged into ${b.end.baseline}` : b.end.kind === "discard" ? "discarded" : "open";

  /** Applies a merge of branch `id` into baseline `target`; seq null = at the release itself. */
  const doMerge = (id: Ident, target: ModelBaseline, mergeSeq: number | null, loc: Loc) => {
    const br = getBranch(id);
    if (!br) return;
    if (br.end.kind !== "open") {
      err("R2", `Rule R2: branch '${br.id}' already has a terminal (${endName(br)}); a branch ends exactly once.`, id.loc);
      return;
    }
    const fork = baselines.get(br.fork);
    // R3: never merge into a baseline older than the fork.
    if (fork && target.status === "released" && target.seq !== null && fork.seq !== null && target.seq <= fork.seq) {
      err(
        "R3",
        `Rule R3: '${br.id}' forked from ${fork.id} and cannot merge into the older (or same) baseline ${target.id}.`,
        id.loc
      );
      return;
    }
    if (target.status === "released" && mergeSeq !== null && target.seq !== null && target.seq < mergeSeq) {
      err(
        "E-MERGE-PAST",
        `Baseline ${target.id} was already released before this statement; use 'release ${target.id} merges ${br.id}' or merge before the release.`,
        loc
      );
      return;
    }
    br.end = { kind: "merge", baseline: target.id, seq: mergeSeq };
    if (br.target && br.target !== target.id) br.previousTargets.push(br.target);
    br.target = undefined;
  };

  const setTarget = (bid: Ident, vid: Ident) => {
    const br = getBranch(bid);
    if (!br) return;
    const v = baselines.get(vid.value);
    if (!v) {
      err("E-UNKNOWN-BASELINE", `Unknown baseline '${vid.value}'. Plan it first: plan ${vid.value}`, vid.loc);
      return;
    }
    if (v.status !== "planned") {
      err("E-TARGET-RELEASED", `Baseline ${v.id} is already released; a branch can only target a planned baseline.`, vid.loc);
      return;
    }
    if (br.end.kind !== "open") {
      err("R2", `Rule R2: branch '${br.id}' is already ${endName(br)} and cannot be (re)targeted.`, bid.loc);
      return;
    }
    if (br.target === v.id) return;
    if (br.target) br.previousTargets = [...br.previousTargets.filter((t) => t !== v.id), br.target];
    br.target = v.id;
  };

  for (const s of statements) {
    if (hasNow && HISTORY_STATEMENTS.has(s.type)) {
      err(
        "E-AFTER-NOW",
        `'${s.type === "branch" ? "branch" : s.type}' is a historical event and cannot appear after 'now'; only 'plan' and 'target' (and notes) may follow it.`,
        s.loc
      );
      continue;
    }
    switch (s.type) {
      case "header":
        break;
      case "config": {
        const key = s.key.value.toLowerCase();
        const val = s.value.value;
        const v = val.toLowerCase();
        const bad = (allowed: string) =>
          err("E-CONFIG", `Invalid value '${val}' for config ${s.key.value}; expected ${allowed}.`, s.value.loc);
        if (key === "time") {
          if (v === "ordinal" || v === "linear") {
            config.time = v as TimeMode;
            if (v === "linear")
              err("I-LINEAR", "config time = linear is not supported yet; the ordinal time axis is used.", s.value.loc, "info");
          } else bad("ordinal | linear");
        } else if (key === "labels") {
          if (v === "full" || v === "ref" || v === "none") config.labels = v as LabelMode;
          else bad("full | ref | none");
        } else if (key === "theme") {
          if (v === "default" || v === "mono" || v === "dark" || v === "auto") config.theme = v as ThemeName;
          else bad("default | mono | dark | auto");
        } else if (key === "showclosed") {
          if (v === "true" || v === "false") config.showClosed = v === "true";
          else bad("true | false");
        } else {
          err("W-CONFIG", `Unknown config key '${s.key.value}' (known: time, labels, theme, showClosed).`, s.key.loc, "warning");
        }
        break;
      }
      case "line": {
        const existing = lines.get(s.id.value);
        if (existing && existing.originSeq !== -3) {
          // Re-declaring a line may update its label (use `use <line>` to switch).
          if (s.label !== undefined) existing.label = s.label;
          if (current === null) current = existing.id;
          if (s.from) {
            const d = defs.get(defKey(s.id.value, "line"));
            err(
              "E-DUP-LINE",
              `Line '${s.id.value}' is already declared${d ? ` (line ${d.line})` : ""}; a line fork must declare a new line (rule R5: parent links never change).`,
              s.id.loc
            );
          }
          break;
        }
        if (s.from) {
          const hw = baselines.get(s.from.value);
          const relocated = hw && hw.status === "released" && hw.kind === "hardware" && hw.line === s.id.value;
          if (!relocated) {
            err(
              "R5",
              hw
                ? `Rule R5: a line fork starts from a released hardware baseline; '${hw.id}' is not one (release ${hw.id} hardware ...). Release streams do not create lines.`
                : `Rule R5: line fork from unknown baseline '${s.from.value}'; release it first with: release ${s.from.value} hardware`,
              s.from.loc
            );
            // Fall through: declare it as an ordinary line.
            if (existing) lines.delete(existing.id);
          } else {
            const l = existing as ModelLine;
            define(l.id, "line", s.id.loc);
            l.label = s.label ?? s.id.value;
            l.originSeq = hw.seq as number;
            l.forkBaseline = hw.id;
            const parent = hwParent.get(hw.id);
            if (parent) l.parent = parent;
            if (current === null) current = l.id;
            break;
          }
        }
        const l = ensureLine(s.id.value, s.label, true);
        define(l.id, "line", s.id.loc);
        if (l.originSeq === -2) l.originSeq = pushEvent("origin", l.id, l.id);
        if (current === null) current = l.id;
        break;
      }
      case "use": {
        if (!lines.has(s.id.value)) {
          err("E-UNKNOWN-LINE", `Unknown line '${s.id.value}'.`, s.id.loc);
          break;
        }
        current = s.id.value;
        break;
      }
      case "release": {
        const stmtLine = resolveLine(s.on, s.loc);
        const id = s.id.value;
        const existing = baselines.get(id);
        if (existing && existing.status === "released") {
          const d = defs.get(`N:${id}`);
          err("E-DUP-BASELINE", `Baseline '${id}' is already released${d ? ` (line ${d.line})` : ""}.`, s.id.loc);
          break;
        }
        if (!existing && branches.has(id)) {
          err("E-DUP-BASELINE", `Id '${id}' is already used${usedBy(id)}.`, s.id.loc);
          break;
        }
        const childLine = childOf.get(id);
        let line = stmtLine;
        if (childLine && s.kind === "hardware") {
          // Relocate to the child line (it is the first node of that line).
          if (!lines.has(childLine)) {
            const l = ensureLine(childLine, childLine);
            l.originSeq = -3; // placeholder: declared by the later `line ... from`
          }
          hwParent.set(id, stmtLine);
          line = childLine;
        }
        if (existing && s.on === undefined && !(childLine && s.kind === "hardware")) line = existing.line;
        const b: ModelBaseline = existing ?? {
          id,
          line,
          kind: s.kind ?? "firmware",
          status: "released",
          seq: null,
          planOrder: null,
          forced: false,
          overdue: false,
          collapsed: 0,
          notes: [],
        };
        if (existing) {
          b.status = "released";
          b.planOrder = null;
          if (s.kind) b.kind = s.kind;
        }
        b.line = line;
        b.seq = pushEvent("release", id, line, s.date);
        if (!existing) define(id, "baseline", s.id.loc);
        // A planned target date is not the release date.
        if (s.date) b.date = s.date;
        else delete b.date;
        if (!existing) baselines.set(id, b);
        for (const m of uniqueList(s.merges, "merges")) doMerge(m, b, null, s.loc);
        // R4: targeted branches still open
        const blocking = [...branches.values()].filter((br) => br.end.kind === "open" && br.target === id);
        if (blocking.length > 0) {
          if (s.force) {
            b.forced = true;
            for (const br of blocking) {
              br.target = undefined;
            }
            err(
              "W-R4-FORCED",
              `Baseline ${id} released with 'force' while ${blocking.map((x) => x.id).join(", ")} ${blocking.length === 1 ? "is" : "are"} still open (rule R4 overridden).`,
              s.id.loc,
              "warning"
            );
          } else {
            err(
              "R4",
              `Rule R4: ${id} cannot be released while targeted branches are open: ${blocking.map((x) => x.id).join(", ")}. Merge them (release ${id} merges ...), re-target or discard them, or add 'force'.`,
              s.id.loc
            );
          }
        }
        break;
      }
      case "plan": {
        const line = resolveLine(s.on, s.loc);
        const id = s.id.value;
        if (baselines.has(id) || branches.has(id)) {
          err("E-DUP-BASELINE", `Id '${id}' is already used${usedBy(id)}.`, s.id.loc);
          break;
        }
        define(id, "baseline", s.id.loc);
        const b: ModelBaseline = {
          id,
          line,
          kind: s.kind ?? "firmware",
          status: "planned",
          seq: null,
          planOrder: planOrder++,
          forced: false,
          overdue: false,
          collapsed: 0,
          notes: [],
        };
        if (s.date) b.date = s.date;
        baselines.set(id, b);
        for (const t of uniqueList(s.targets, "targets")) setTarget(t, s.id);
        break;
      }
      case "branch": {
        const id = s.id.value;
        if (branches.has(id) || baselines.has(id)) {
          err("E-DUP-BRANCH", `Id '${id}' is already used${usedBy(id)}.`, s.id.loc);
          if (!branches.has(id)) rejected.add(id);
          break;
        }
        let line = resolveLine(s.on, s.loc);
        let fork: ModelBaseline | null = null;
        if (s.from) {
          const f = baselines.get(s.from.value);
          if (!f) err("E-UNKNOWN-BASELINE", `Unknown baseline '${s.from.value}'.`, s.from.loc);
          else if (f.status !== "released")
            err("R1", `Rule R1: a branch forks from a released baseline; '${f.id}' is only planned.`, s.from.loc);
          else {
            fork = f;
            if (s.on && f.line !== line)
              err("E-FORK-LINE", `Baseline '${f.id}' belongs to line '${f.line}', not '${line}'.`, s.from.loc);
            line = f.line;
          }
        } else {
          fork = latestReleased(line);
          if (!fork) {
            err(
              "R1",
              `Rule R1: line '${line}' has no released baseline to fork '${id}' from. Add 'release <version>' first or use 'from <version>'.`,
              s.id.loc
            );
          }
        }
        if (!fork) {
          rejected.add(id);
          break;
        }
        define(id, "branch", s.id.loc);
        const br: ModelBranch = {
          id,
          type: s.branchType,
          line,
          fork: fork.id,
          openSeq: pushEvent("open", id, line, s.date),
          steps: [],
          end: { kind: "open" },
          previousTargets: [],
          notes: [],
        };
        if (s.title !== undefined) br.title = s.title;
        if (s.date) br.date = s.date;
        branches.set(id, br);
        if (s.target) setTarget(s.id, s.target);
        break;
      }
      case "step": {
        const br = getBranch(s.id);
        if (!br) break;
        if (br.end.kind !== "open") {
          err("R2", `Rule R2: branch '${br.id}' is already ${endName(br)}; no steps after its terminal.`, s.id.loc);
          break;
        }
        const st = { seq: pushEvent("step", br.id, br.line, s.date), state: s.state } as ModelBranch["steps"][number];
        if (s.text !== undefined) st.text = s.text;
        if (s.date) st.date = s.date;
        br.steps.push(st);
        break;
      }
      case "merge": {
        const br = getBranch(s.id);
        if (!br) break;
        const target = baselines.get(s.into.value);
        if (!target) {
          err("E-UNKNOWN-BASELINE", `Unknown baseline '${s.into.value}'. Release or plan it first.`, s.into.loc);
          break;
        }
        if (br.end.kind !== "open") {
          err("R2", `Rule R2: branch '${br.id}' already has a terminal (${endName(br)}); a branch ends exactly once.`, s.id.loc);
          break;
        }
        if (target.status === "released") {
          // Reports R3 or E-MERGE-PAST (a released baseline cannot receive later merges).
          doMerge(s.id, target, seq, s.loc);
          break;
        }
        const mseq = pushEvent("merge", br.id, br.line, s.date);
        doMerge(s.id, target, mseq, s.loc);
        break;
      }
      case "discard": {
        const br = getBranch(s.id);
        if (!br) break;
        if (br.end.kind !== "open") {
          err("R2", `Rule R2: branch '${br.id}' already has a terminal (${endName(br)}); a branch ends exactly once.`, s.id.loc);
          break;
        }
        if (s.reason === undefined || s.reason.trim() === "") {
          err(
            "R2",
            `Rule R2: discard of '${br.id}' has no rationale. Add the reason in quotes, e.g.: discard ${br.id} "duplicate of X-12"`,
            s.id.loc,
            "warning"
          );
        }
        const dseq = pushEvent("discard", br.id, br.line, s.date);
        br.end = { kind: "discard", seq: dseq };
        if (s.reason !== undefined) br.end.reason = s.reason;
        if (br.target) br.previousTargets.push(br.target);
        br.target = undefined;
        break;
      }
      case "target":
        setTarget(s.id, s.version);
        break;
      case "now":
        if (hasNow) err("E-DUP-NOW", "'now' may appear only once.", s.loc);
        hasNow = true;
        break;
      case "eos": {
        const line = s.line ? resolveLine(s.line, s.loc) : currentLine(s.loc);
        const l = lines.get(line) as ModelLine;
        if (l.eos) {
          err("E-DUP-EOS", `Line '${line}' already has an end of support.`, s.loc);
          break;
        }
        l.eos = { seq: pushEvent("eos", line, line, s.date) };
        if (s.date) l.eos.date = s.date;
        break;
      }
      case "collapse": {
        const b = baselines.get(s.version.value);
        if (!b) {
          err("E-UNKNOWN-BASELINE", `Unknown baseline '${s.version.value}'.`, s.version.loc);
          break;
        }
        b.collapsed += s.count;
        break;
      }
      case "note": {
        const id = s.target.value;
        const b = baselines.get(id);
        const br = branches.get(id);
        const l = lines.get(id);
        if (l && (b || br)) {
          err("R7", `Rule R7: a note is attached to exactly one node, but '${id}' names both a line and a ${b ? "baseline" : "branch"}.`, s.target.loc);
        } else if (b) b.notes.push(s.text);
        else if (br) br.notes.push(s.text);
        else if (l) l.notes.push(s.text);
        else if (!rejected.has(id)) {
          err("R7", `Rule R7: a note must be attached to an existing line, baseline or branch; '${id}' is none of them.`, s.target.loc);
        }
        break;
      }
    }
  }

  // Lines referenced by a line fork that was never declared (placeholder) fall back to their parent.
  for (const l of lines.values()) {
    if (l.originSeq === -3) {
      for (const b of baselines.values()) {
        if (b.line === l.id) b.line = hwParent.get(b.id) ?? b.line;
      }
      lines.delete(l.id);
    }
  }
  // Re-index lines in declaration order.
  let idx = 0;
  for (const l of lines.values()) l.index = idx++;

  // Releases after EoS
  for (const l of lines.values()) {
    if (!l.eos) continue;
    for (const e of events) {
      if (e.line === l.id && e.seq > l.eos.seq && (e.kind === "release" || e.kind === "open")) {
        const stmt = statements.find((s) => (s.type === "release" || s.type === "branch") && s.id.value === e.ref);
        if (stmt)
          diags.push({
            severity: "warning",
            code: "W-AFTER-EOS",
            message: `Rule R5 (life cycle): '${e.ref}' happens after the end of support of line '${l.id}'.`,
            line: stmt.loc.line,
            col: stmt.loc.col,
            endCol: stmt.loc.endCol,
          });
      }
    }
  }

  // Overdue planned baselines: target date earlier than the latest historical date.
  if (lastDate) {
    const last: DateValue = lastDate;
    for (const b of baselines.values()) {
      if (b.status === "planned" && b.date && dateKey(b.date) < dateKey(last)) b.overdue = true;
    }
  }

  const model: HpbModel = {
    config,
    lines: [...lines.values()],
    baselines: [...baselines.values()],
    branches: [...branches.values()],
    events,
    hasNow,
    diagnostics: diags,
  };
  if (ast?.title !== undefined) model.title = ast.title;
  return model;
}

export type { BaselineKind };
