/**
 * remark-hpb — remark (unified) plugin that replaces ```hpb fenced code with
 * an inline HPB SVG diagram (an mdast `html` node).
 * Copyright (c) 2026 Achraf Bouchtarouif El Khiat. MIT License.
 *
 *   unified().use(remarkParse).use(remarkHpb)
 *     .use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw).use(rehypeStringify)
 *
 * Diagnostics are reported as vfile messages (with the line inside the
 * Markdown file). Errors render the core error box unless `onError: "throw"`.
 */
import { createIdAllocator, languageMatcher, renderBlock, type HpbMarkdownOptions } from "./shared";

export type RemarkHpbOptions = HpbMarkdownOptions;
export type { HpbMarkdownOptions } from "./shared";
export { markdownItHpb } from "./markdown-it";
export type { MarkdownItHpbOptions, MarkdownItLike } from "./markdown-it";

/** Structural subset of mdast/unist used by the plugin (no runtime dependency on unist utilities). */
interface Point {
  line: number;
  column: number;
}
interface MdNode {
  type: string;
  lang?: string | null;
  value?: string;
  position?: { start: Point; end: Point };
  children?: MdNode[];
  data?: Record<string, unknown>;
}
interface VFileLike {
  // Method syntax (bivariant) so a real VFile is accepted.
  message?(reason: string, place?: unknown, origin?: string): { fatal?: boolean | null; ruleId?: string | null; source?: string | null };
}

export default function remarkHpb(options: RemarkHpbOptions = {}) {
  const isHpb = languageMatcher(options.languages);
  return function transformer(tree: MdNode, file?: VFileLike): void {
    const alloc = createIdAllocator(options.idPrefix);
    const visit = (node: MdNode): void => {
      const children = node.children;
      if (!children) return;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.type === "code" && isHpb(child.lang)) {
          const source = child.value ?? "";
          const { html, diagnostics } = renderBlock(source, options, alloc(source));
          if (file && typeof file.message === "function") {
            // The fence line is position.start.line; the code starts on the next line.
            const offset = child.position ? child.position.start.line : 0;
            for (const d of diagnostics) {
              const place = { line: offset + d.line, column: d.col };
              const msg = file.message(`${d.message}`, place, `remark-hpb:${d.code}`);
              // vfile convention: true = error, false = warning, null = info.
              msg.fatal = d.severity === "error" ? true : d.severity === "warning" ? false : null;
              msg.ruleId = d.code;
              msg.source = "remark-hpb";
            }
          }
          const replacement: MdNode = { type: "html", value: html };
          if (child.position) replacement.position = child.position;
          children[i] = replacement;
        } else {
          visit(child);
        }
      }
    };
    visit(tree);
  };
}

export { remarkHpb };
