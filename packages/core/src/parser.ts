/**
 * Parser for HPB Markup v1.0. Forgiving: optional clauses may appear in any
 * order, keywords are case-insensitive, and every problem is reported as a
 * diagnostic with line and column (the parser never throws).
 */
import { lex, type Token } from "./lexer";
import type {
  BaselineKind,
  BranchType,
  DateValue,
  Diagnostic,
  HpbAst,
  Ident,
  Loc,
  ParseResult,
  Statement,
  StepState,
} from "./types";

const BRANCH_TYPES: Record<string, BranchType> = {
  improvement: "improvement",
  imp: "improvement",
  feature: "improvement",
  issue: "issue",
  bug: "issue",
  defect: "issue",
  x: "issue",
  task: "task",
  t: "task",
  lab: "lab",
  l: "lab",
  evolution: "lab",
};

const KINDS: BaselineKind[] = ["firmware", "software", "hardware", "other"];
const STEP_STATES: StepState[] = ["done", "todo", "pass", "fail"];

/** Words that cannot be used as ids in clause positions. */
const CLAUSE_WORDS = new Set(["from", "on", "targets", "merges", "force", "into"]);

export const STATEMENT_KEYWORDS = [
  "hpb",
  "config",
  "line",
  "use",
  "release",
  "plan",
  "improvement",
  "issue",
  "task",
  "lab",
  "step",
  "merge",
  "discard",
  "target",
  "now",
  "eos",
  "collapse",
  "note",
];

class LineParser {
  i = 0;
  constructor(
    readonly tokens: Token[],
    readonly diags: Diagnostic[],
    readonly stmtName: string
  ) {}

  get done(): boolean {
    return this.i >= this.tokens.length;
  }
  peek(): Token | undefined {
    return this.tokens[this.i];
  }
  next(): Token | undefined {
    return this.tokens[this.i++];
  }
  peekWord(): string | null {
    const t = this.peek();
    return t && t.kind === "word" ? t.value.toLowerCase() : null;
  }
  error(t: Token | undefined, message: string, code = "E-SYNTAX"): void {
    const last = this.tokens[this.tokens.length - 1];
    const at = t ?? last;
    this.diags.push({
      severity: "error",
      code,
      message,
      line: at.line,
      col: t ? t.col : last.endCol,
      endCol: t ? t.endCol : last.endCol + 1,
    });
  }
  ident(what: string, allowClauseWord = false): Ident | null {
    const t = this.peek();
    if (!t || t.kind !== "word") {
      this.error(t, `Expected ${what} in '${this.stmtName}' statement${t ? `, found ${describe(t)}` : ""}.`);
      return null;
    }
    if (!allowClauseWord && CLAUSE_WORDS.has(t.value.toLowerCase())) {
      this.error(t, `Expected ${what} in '${this.stmtName}' statement, found the keyword '${t.value}'.`);
      return null;
    }
    this.i++;
    return { value: t.value, loc: locOf(t) };
  }
  optString(): string | undefined {
    const t = this.peek();
    if (t && t.kind === "string") {
      this.i++;
      return t.value;
    }
    return undefined;
  }
  date(): DateValue | null {
    const t = this.next() as Token;
    return parseDate(t, this.diags);
  }
  idList(what: string): Ident[] {
    const out: Ident[] = [];
    const first = this.ident(what);
    if (!first) return out;
    out.push(first);
    while (this.peek()?.kind === "comma") {
      this.i++;
      const id = this.ident(what);
      if (!id) break;
      out.push(id);
    }
    return out;
  }
  unexpected(expected: string): void {
    const t = this.peek();
    this.error(t, `Unexpected ${t ? describe(t) : "end of line"} in '${this.stmtName}' statement; expected ${expected}.`);
    this.i = this.tokens.length; // skip the rest of the line
  }
}

function describe(t: Token): string {
  switch (t.kind) {
    case "string":
      return `string "${t.value}"`;
    case "date":
      return `date '@${t.value}'`;
    case "comma":
      return "','";
    case "eq":
      return "'='";
    default:
      return `'${t.value}'`;
  }
}

function locOf(t: Token): Loc {
  return { line: t.line, col: t.col, endCol: t.endCol };
}

function parseDate(t: Token, diags: Diagnostic[]): DateValue | null {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(t.value);
  const bad = (msg: string): null => {
    diags.push({ severity: "error", code: "E-DATE", message: msg, line: t.line, col: t.col, endCol: t.endCol });
    return null;
  };
  if (!m) return bad(`Invalid date '@${t.value}'. Use @YYYY-MM or @YYYY-MM-DD.`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = m[3] ? Number(m[3]) : undefined;
  if (month < 1 || month > 12) return bad(`Invalid month in '@${t.value}'.`);
  if (day !== undefined) {
    const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day < 1 || day > dim) return bad(`Invalid day in '@${t.value}'.`);
  }
  return { year, month, day, raw: t.value, loc: locOf(t) };
}

function stmtLoc(tokens: Token[]): Loc {
  return { line: tokens[0].line, col: tokens[0].col, endCol: tokens[tokens.length - 1].endCol };
}

/** Parses HPB Markup text into an AST plus diagnostics. Never throws. */
export function parse(text: string): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const statements: Statement[] = [];
  let title: string | undefined;
  const lines = lex(typeof text === "string" ? text : "", diagnostics);

  for (const { tokens } of lines) {
    const head = tokens[0];
    const loc = stmtLoc(tokens);
    if (head.kind !== "word") {
      diagnostics.push({
        severity: "error",
        code: "E-SYNTAX",
        message: `A statement must start with a keyword (${STATEMENT_KEYWORDS.slice(0, 8).join(", ")}, ...), found ${describe(head)}.`,
        line: head.line,
        col: head.col,
        endCol: head.endCol,
      });
      continue;
    }
    const kw = head.value.toLowerCase();
    const p = new LineParser(tokens, diagnostics, kw);
    p.i = 1;
    const stmt = parseStatement(kw, p, loc, statements.length === 0);
    if (stmt) {
      if (!p.done) p.unexpected("end of line");
      if (stmt.type === "header") {
        if (title !== undefined || statements.some((s) => s.type !== "header")) {
          diagnostics.push({
            severity: "warning",
            code: "W-HEADER",
            message: "The 'hpb' header should be the first statement of the document.",
            line: loc.line,
            col: loc.col,
            endCol: head.endCol,
          });
        }
        if (stmt.title !== undefined) title = stmt.title;
      }
      statements.push(stmt);
    }
  }

  const ast: HpbAst = { type: "document", statements };
  if (title !== undefined) ast.title = title;
  return { ast, diagnostics: limitSyntaxErrors(typeof text === "string" ? text : "", diagnostics) };
}

/**
 * Keeps at most one syntax error per source line, and adds a single hint when
 * most lines fail (the input is probably not HPB Markup at all).
 */
function limitSyntaxErrors(text: string, diagnostics: Diagnostic[]): Diagnostic[] {
  const errorLines = new Set<number>();
  const out: Diagnostic[] = [];
  for (const d of diagnostics) {
    if (d.severity === "error") {
      if (errorLines.has(d.line)) continue;
      errorLines.add(d.line);
    }
    out.push(d);
  }
  const content = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return t !== "" && !t.startsWith("#") && !t.startsWith("%%");
    }).length;
  if (errorLines.size >= 3 && errorLines.size * 2 > content) {
    out.unshift({
      severity: "error",
      code: "E-NOT-HPB",
      message: `${errorLines.size} of ${content} lines are not valid HPB Markup. Is this an HPB Markup file? (Statements start with a keyword such as line, release, issue or plan.)`,
      line: 1,
      col: 1,
      endCol: 2,
    });
  }
  return out;
}

function parseStatement(kw: string, p: LineParser, loc: Loc, _first: boolean): Statement | null {
  switch (kw) {
    case "hpb": {
      const title = p.optString();
      return { type: "header", title, loc };
    }
    case "config": {
      const key = p.ident("a config key", true);
      if (!key) return null;
      if (p.peek()?.kind === "eq") p.i++;
      const vt = p.peek();
      if (!vt || (vt.kind !== "word" && vt.kind !== "string")) {
        p.error(vt, `Expected a value for config '${key.value}'.`);
        return null;
      }
      p.i++;
      return { type: "config", key, value: { value: vt.value, loc: locOf(vt) }, loc };
    }
    case "line": {
      const id = p.ident("a line id");
      if (!id) return null;
      const label = p.optString();
      let from: Ident | undefined;
      if (p.peekWord() === "from") {
        p.i++;
        from = p.ident("a hardware baseline after 'from'") ?? undefined;
      }
      return { type: "line", id, label, from, loc };
    }
    case "use": {
      const id = p.ident("a line id");
      return id ? { type: "use", id, loc } : null;
    }
    case "release":
    case "plan": {
      const id = p.ident("a baseline (version) id");
      if (!id) return null;
      let kind: BaselineKind | undefined;
      let date: DateValue | undefined;
      let on: Ident | undefined;
      let force = false;
      const list: Ident[] = [];
      const listKw = kw === "release" ? "merges" : "targets";
      while (!p.done) {
        const t = p.peek() as Token;
        const w = p.peekWord();
        if (t.kind === "date") {
          date = p.date() ?? undefined;
        } else if (w && (KINDS as string[]).includes(w)) {
          p.i++;
          kind = w as BaselineKind;
        } else if (w === listKw) {
          p.i++;
          list.push(...p.idList(kw === "release" ? "a branch id after 'merges'" : "a branch id after 'targets'"));
        } else if (w === "force" && kw === "release") {
          p.i++;
          force = true;
        } else if (w === "on") {
          p.i++;
          on = p.ident("a line id after 'on'") ?? undefined;
        } else {
          p.unexpected(
            kw === "release"
              ? "a kind (firmware|software|hardware|other), a date (@YYYY-MM), 'merges', 'force' or 'on'"
              : "a kind (firmware|software|hardware|other), a date (@YYYY-MM), 'targets' or 'on'"
          );
        }
      }
      return kw === "release"
        ? { type: "release", id, kind, date, merges: list, force, on, loc }
        : { type: "plan", id, kind, date, targets: list, on, loc };
    }
    case "step": {
      const id = p.ident("a branch id");
      if (!id) return null;
      const st = p.peekWord();
      if (!st || !(STEP_STATES as string[]).includes(st)) {
        p.error(p.peek(), "Rule R6: expected a step state: done, todo, pass or fail.", "R6");
        return null;
      }
      p.i++;
      let text: string | undefined;
      let date: DateValue | undefined;
      while (!p.done) {
        const t = p.peek() as Token;
        if (t.kind === "string" && text === undefined) text = p.optString();
        else if (t.kind === "date") date = p.date() ?? undefined;
        else p.unexpected("a description string or a date");
      }
      return { type: "step", id, state: st as StepState, text, date, loc };
    }
    case "merge": {
      const id = p.ident("a branch id");
      if (!id) return null;
      if (p.peekWord() !== "into") {
        p.error(p.peek(), "Expected 'into <version>' after the branch id.");
        return null;
      }
      p.i++;
      const into = p.ident("a baseline id after 'into'");
      if (!into) return null;
      let date: DateValue | undefined;
      while (!p.done) {
        if (p.peek()?.kind === "date") date = p.date() ?? undefined;
        else p.unexpected("a date");
      }
      return { type: "merge", id, into, date, loc };
    }
    case "discard": {
      const id = p.ident("a branch id");
      if (!id) return null;
      let reason: string | undefined;
      let date: DateValue | undefined;
      while (!p.done) {
        const t = p.peek() as Token;
        if (t.kind === "string" && reason === undefined) reason = p.optString();
        else if (t.kind === "date") date = p.date() ?? undefined;
        else p.unexpected("a rationale string or a date");
      }
      return { type: "discard", id, reason, date, loc };
    }
    case "target": {
      const id = p.ident("a branch id");
      if (!id) return null;
      const version = p.ident("a planned baseline id");
      if (!version) return null;
      return { type: "target", id, version, loc };
    }
    case "now":
      return { type: "now", loc };
    case "eos": {
      let line: Ident | undefined;
      let date: DateValue | undefined;
      while (!p.done) {
        const t = p.peek() as Token;
        if (t.kind === "date") date = p.date() ?? undefined;
        else if (t.kind === "word" && !line) line = p.ident("a line id") ?? undefined;
        else p.unexpected("a line id or a date");
      }
      return { type: "eos", line, date, loc };
    }
    case "collapse": {
      const version = p.ident("a baseline id");
      if (!version) return null;
      const t = p.peek();
      if (!t || t.kind !== "word" || !/^\d+$/.test(t.value)) {
        p.error(t, "Expected the number of hidden merged branches (an integer).");
        return null;
      }
      p.i++;
      return { type: "collapse", version, count: Number(t.value), loc };
    }
    case "note": {
      const target = p.ident("a baseline or branch id");
      if (!target) return null;
      const text = p.optString();
      if (text === undefined) {
        p.error(p.peek(), "Expected the note text in double quotes.");
        return null;
      }
      return { type: "note", target, text, loc };
    }
    default: {
      const bt = BRANCH_TYPES[kw];
      if (bt) {
        const id = p.ident("a branch id");
        if (!id) return null;
        let title: string | undefined;
        let from: Ident | undefined;
        let on: Ident | undefined;
        let target: Ident | undefined;
        let date: DateValue | undefined;
        while (!p.done) {
          const t = p.peek() as Token;
          const w = p.peekWord();
          if (t.kind === "string" && title === undefined) title = p.optString();
          else if (t.kind === "date") date = p.date() ?? undefined;
          else if (w === "from") {
            p.i++;
            from = p.ident("a baseline id after 'from'") ?? undefined;
          } else if (w === "on") {
            p.i++;
            on = p.ident("a line id after 'on'") ?? undefined;
          } else if (w === "targets" || w === "target") {
            p.i++;
            target = p.ident("a planned baseline id after 'targets'") ?? undefined;
          } else p.unexpected("a title string, 'from', 'on', 'targets' or a date");
        }
        return { type: "branch", branchType: bt, id, title, from, on, target, date, loc };
      }
      const t = p.tokens[0];
      const suggestion = closest(kw, [...STATEMENT_KEYWORDS, ...Object.keys(BRANCH_TYPES)]);
      // `<word> <id> "title" ...` has the shape of a branch with an unknown type (rule R6).
      const [, second, third] = p.tokens;
      if (second && second.kind === "word" && third && third.kind === "string") {
        p.diags.push({
          severity: "error",
          code: "R6",
          message: `Rule R6: unknown branch type '${t.value}'. A branch has exactly one type: improvement, issue, task or lab.${suggestion ? ` Did you mean '${suggestion}'?` : ""}`,
          line: t.line,
          col: t.col,
          endCol: t.endCol,
        });
        return null;
      }
      p.diags.push({
        severity: "error",
        code: "E-SYNTAX",
        message: `Unknown statement '${t.value}'.${suggestion ? ` Did you mean '${suggestion}'?` : ""}`,
        line: t.line,
        col: t.col,
        endCol: t.endCol,
      });
      return null;
    }
  }
}

function closest(word: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestD = 3;
  for (const c of candidates) {
    const d = levenshtein(word, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}
