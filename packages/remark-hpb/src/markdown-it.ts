/**
 * markdown-it plugin: renders ```hpb fences as inline HPB SVG diagrams.
 * Copyright (c) 2026 Achraf Bouchtarouif El Khiat. MIT License.
 *
 *   import MarkdownIt from "markdown-it";
 *   import markdownItHpb from "remark-hpb/markdown-it";
 *   const md = new MarkdownIt().use(markdownItHpb, { theme: "default" });
 *
 * The SVG is produced by @hpb/core, which escapes every piece of user text,
 * so the output is safe even with markdown-it's `html: false`.
 */
import { createIdAllocator, languageMatcher, renderBlock, type HpbMarkdownOptions } from "./shared";

/** Minimal structural types, so users do not need @types/markdown-it. */
export interface MarkdownItToken {
  info: string;
  content: string;
}
export type MarkdownItRenderRule = (
  tokens: MarkdownItToken[],
  idx: number,
  options: unknown,
  env: unknown,
  self: { renderToken(tokens: MarkdownItToken[], idx: number, options: unknown): string }
) => string;
export interface MarkdownItLike {
  // `any` keeps the real MarkdownIt instance (with its richer Token type) assignable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderer: { rules: { fence?: (...args: any[]) => string } };
}

export type MarkdownItHpbOptions = HpbMarkdownOptions;

const ENV_KEY = "__hpbIdAllocator";

export function markdownItHpb(md: MarkdownItLike, options: MarkdownItHpbOptions = {}): void {
  const isHpb = languageMatcher(options.languages);
  const previous = md.renderer.rules.fence as MarkdownItRenderRule | undefined;
  const rule: MarkdownItRenderRule = (tokens, idx, opts, env, self) => {
    const token = tokens[idx];
    if (!isHpb(token.info)) {
      return previous ? previous(tokens, idx, opts, env, self) : self.renderToken(tokens, idx, opts);
    }
    // One id allocator per render() call (markdown-it passes the same env object).
    let alloc: ((s: string) => string | undefined) | undefined;
    if (env && typeof env === "object") {
      const e = env as Record<string, unknown>;
      if (typeof e[ENV_KEY] !== "function") {
        Object.defineProperty(e, ENV_KEY, { value: createIdAllocator(options.idPrefix), enumerable: false });
      }
      alloc = e[ENV_KEY] as (s: string) => string | undefined;
    }
    const idPrefix = alloc ? alloc(token.content) : options.idPrefix;
    return renderBlock(token.content, options, idPrefix).html + "\n";
  };
  md.renderer.rules.fence = rule;
}

export default markdownItHpb;
