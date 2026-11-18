/**
 * Line-oriented lexer for HPB Markup. One statement per line; `#` and `%%`
 * start comments; keywords are case-insensitive (handled by the parser).
 */
import type { Diagnostic } from "./types";

export type TokenKind = "word" | "string" | "date" | "comma" | "eq";

export interface Token {
  kind: TokenKind;
  /** Raw text for words/dates; unescaped content for strings. */
  value: string;
  line: number;
  col: number; // 1-based
  endCol: number; // exclusive
}

export interface LexedLine {
  line: number;
  tokens: Token[];
}

const WORD_CHAR = /[A-Za-z0-9._\-]/;

export function lex(text: string, diagnostics: Diagnostic[]): LexedLine[] {
  const out: LexedLine[] = [];
  // Normalise newlines and strip a BOM.
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = src.split("\n");
  for (let li = 0; li < lines.length; li++) {
    const lineNo = li + 1;
    const s = lines[li];
    const tokens: Token[] = [];
    let i = 0;
    let failed = false;
    while (i < s.length) {
      const ch = s[i];
      if (ch === " " || ch === "\t" || ch === " ") {
        i++;
        continue;
      }
      if (ch === "#" || (ch === "%" && s[i + 1] === "%")) break; // comment
      const col = i + 1;
      if (ch === '"' || ch === "“" || ch === "”") {
        let j = i + 1;
        let value = "";
        let closed = false;
        while (j < s.length) {
          const c = s[j];
          if (c === "\\" && j + 1 < s.length) {
            value += s[j + 1];
            j += 2;
            continue;
          }
          if (c === '"' || c === "”" || c === "“") {
            closed = true;
            j++;
            break;
          }
          value += c;
          j++;
        }
        if (!closed) {
          diagnostics.push({
            severity: "error",
            code: "E-SYNTAX",
            message: "Unterminated string: add the closing double quote.",
            line: lineNo,
            col,
            endCol: s.length + 1,
          });
        }
        tokens.push({ kind: "string", value, line: lineNo, col, endCol: j + 1 });
        i = j;
        continue;
      }
      if (ch === ",") {
        tokens.push({ kind: "comma", value: ",", line: lineNo, col, endCol: col + 1 });
        i++;
        continue;
      }
      if (ch === "=") {
        tokens.push({ kind: "eq", value: "=", line: lineNo, col, endCol: col + 1 });
        i++;
        continue;
      }
      if (ch === "@") {
        let j = i + 1;
        while (j < s.length && /[0-9\-]/.test(s[j])) j++;
        const raw = s.slice(i + 1, j);
        tokens.push({ kind: "date", value: raw, line: lineNo, col, endCol: j + 1 });
        i = j;
        continue;
      }
      if (WORD_CHAR.test(ch)) {
        let j = i;
        while (j < s.length && WORD_CHAR.test(s[j])) j++;
        tokens.push({ kind: "word", value: s.slice(i, j), line: lineNo, col, endCol: j + 1 });
        i = j;
        continue;
      }
      diagnostics.push({
        severity: "error",
        code: "E-SYNTAX",
        message: `Unexpected character '${ch}'. Ids may only contain letters, digits, '.', '_' and '-'; put free text in double quotes.`,
        line: lineNo,
        col,
        endCol: col + 1,
      });
      // One syntax error per line: the rest of the line is skipped (this keeps
      // a non-HPB file from producing one diagnostic per character).
      failed = true;
      break;
    }
    if (tokens.length > 0 && !failed) out.push({ line: lineNo, tokens });
  }
  return out;
}
