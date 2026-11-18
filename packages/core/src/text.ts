/** Text helpers: XML escaping, safe ids and a deterministic text-width estimate. */

export function escapeXml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    // Strip characters that are not allowed in XML 1.0.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");
}

/** Encodes an arbitrary id into [A-Za-z0-9_-] (injective). */
export function safeId(value: string): string {
  let out = "";
  for (const ch of value) {
    if (/[A-Za-z0-9-]/.test(ch)) out += ch;
    else out += `_${ch.codePointAt(0)!.toString(16)}_`;
  }
  return out;
}

/** FNV-1a 32-bit hash, base36. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const NARROW = new Set("il.,:;|!'`ijtfrI()[]{} ".split(""));
const WIDE = new Set("mwMW@%".split(""));

/** Approximate rendered width of `text` in a sans-serif font (px). Deterministic. */
export function textWidth(text: string, fontSize: number, bold = false): number {
  let units = 0;
  for (const ch of text) {
    if (NARROW.has(ch)) units += 0.3;
    else if (WIDE.has(ch)) units += 0.86;
    else if (ch >= "A" && ch <= "Z") units += 0.66;
    else if (ch >= "0" && ch <= "9") units += 0.56;
    else if (ch === "—" || ch === "–") units += 0.8;
    else units += 0.54;
  }
  return Math.ceil(units * fontSize * (bold ? 1.07 : 1));
}

/** Rounds to 2 decimals for compact, stable output. */
export function n(v: number): string {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function monthName(month: number): string {
  return MONTHS[month - 1] ?? "";
}
