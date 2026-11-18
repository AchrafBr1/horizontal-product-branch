/**
 * <HpbDiagram />: React component for HPB Markup.
 * Copyright (c) 2026 Achraf Bouchtarouif El Khiat. MIT License.
 *
 * Rendering is a pure function of the props (renderSVG from @hpb/core returns an
 * escaped SVG string), so the component is SSR-safe and hydrates without
 * mismatches. Interactivity (hover dimming, click, keyboard) is attached after
 * mount through event delegation on the data-hpb-kind / data-hpb-id attributes
 * that the core renderer emits.
 */
import { useEffect, useId, useMemo, useRef } from "react";
import type { CSSProperties, HTMLAttributes } from "react";
import { renderDiagram } from "@hpb/core";
import type { Diagnostic, HpbOptions, LabelMode, ThemeName } from "@hpb/core";

/** What a click on a diagram element reports. */
export interface HpbNodeClick {
  kind: "branch" | "baseline";
  /** The branch or baseline id exactly as written in the source (e.g. "X-101", "v1.1"). */
  id: string;
}

export interface HpbDiagramProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children" | "dangerouslySetInnerHTML" | "onError"> {
  /** HPB Markup source text. */
  code: string;
  /** Colour theme: "default" | "mono" | "dark" | "auto" (follows prefers-color-scheme). Overrides `config theme` in the source. */
  theme?: ThemeName;
  /** Show merged and discarded branches. Overrides `config showClosed` in the source. */
  showClosed?: boolean;
  /** Label mode: "full" | "ref" | "none". */
  labels?: LabelMode;
  /**
   * Any other renderer option (colWidth, laneHeight, padding, fontFamily, ariaTitle, idPrefix, showTitle).
   * The id prefix defaults to a per-instance value from React's useId(), so two
   * diagrams with the same source never share element ids.
   */
  options?: Omit<HpbOptions, "onError">;
  className?: string;
  style?: CSSProperties;
  /**
   * Called when the user clicks (or presses Enter/Space on) a branch or a baseline.
   * When set, elements get a pointer cursor and become keyboard-focusable.
   */
  onNodeClick?: (node: HpbNodeClick) => void;
  /**
   * Called after each render where the source has errors (the component then shows
   * the core's error box). Receives every diagnostic, sorted by position.
   * It is not called once the errors are fixed: use `onDiagnostics` to clear an error panel.
   */
  onError?: (diagnostics: Diagnostic[]) => void;
  /**
   * Called after every render with the full list of diagnostics: errors, warnings,
   * bad options ("E-OPTION"), or [] when the source is clean. Use it for live editors.
   */
  onDiagnostics?: (diagnostics: Diagnostic[]) => void;
  /** Dim the other branches and baselines while hovering one (default true). */
  hoverDim?: boolean;
}

const DIM_OPACITY = "0.35";
const FOCUS_SELECTOR = "g.hpb-branch[data-hpb-id], g.hpb-baseline[data-hpb-id]";

/** Accessible name of a node group: the text of its own <title>. */
function nodeLabel(el: Element): string {
  for (const child of Array.from(el.children)) {
    if (child.tagName.toLowerCase() === "title") return (child.textContent ?? "").trim();
  }
  return el.getAttribute("data-hpb-id") ?? "";
}

/**
 * Makes the diagram operable: the root <svg> becomes a group (role="img" would hide
 * its children from assistive technology) and every branch / baseline a named button.
 * Returns a function that restores the static (role="img") markup.
 */
function makeOperable(root: Element): () => void {
  const svg = root.querySelector("svg.hpb");
  const nodes = Array.from(root.querySelectorAll<SVGElement>(FOCUS_SELECTOR));
  if (svg) {
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-roledescription", "HPB diagram");
  }
  for (const el of nodes) {
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", nodeLabel(el));
  }
  return () => {
    if (svg) {
      svg.setAttribute("role", "img");
      svg.removeAttribute("aria-roledescription");
    }
    for (const el of nodes) {
      el.setAttribute("tabindex", "-1");
      el.removeAttribute("role");
      el.removeAttribute("aria-label");
    }
  };
}

function targetOf(event: Event, root: HTMLElement): HTMLElement | SVGElement | null {
  const start = event.target as Element | null;
  if (!start || typeof start.closest !== "function") return null;
  const el = start.closest("[data-hpb-id]") as HTMLElement | SVGElement | null;
  return el && root.contains(el) ? el : null;
}

function nodeOf(el: Element): HpbNodeClick | null {
  const kind = el.getAttribute("data-hpb-kind");
  const id = el.getAttribute("data-hpb-id");
  if ((kind !== "branch" && kind !== "baseline") || id === null) return null;
  return { kind, id };
}

/**
 * Renders an HPB diagram from HPB Markup text.
 *
 * ```tsx
 * <HpbDiagram code={source} theme="default" onNodeClick={({ kind, id }) => open(id)} />
 * ```
 */
export function HpbDiagram(props: HpbDiagramProps) {
  const {
    code,
    theme,
    showClosed,
    labels,
    options,
    className,
    style,
    onNodeClick,
    onError,
    onDiagnostics,
    hoverDim = true,
    ...rest
  } = props;

  // Stable across server and client renders (React 18 useId), unique per instance.
  const uid = useId();
  const optionsKey = options ? JSON.stringify(options) : "";
  const { svg, diagnostics } = useMemo(() => {
    const opts: HpbOptions = {
      ...(options ?? {}),
      idPrefix: options?.idPrefix ?? `hpb${uid.replace(/[^A-Za-z0-9-]/g, "")}`,
      onError: "box",
    };
    if (theme !== undefined) opts.theme = theme;
    if (showClosed !== undefined) opts.showClosed = showClosed;
    if (labels !== undefined) opts.labels = labels;
    // One parse for both the SVG and the diagnostics.
    return renderDiagram(code ?? "", opts);
    // `options` is compared by value through optionsKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, theme, showClosed, labels, optionsKey, uid]);

  const hasError = diagnostics.some((d) => d.severity === "error");
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep the latest callbacks without re-binding listeners on every render.
  const clickRef = useRef(onNodeClick);
  const errorRef = useRef(onError);
  const diagRef = useRef(onDiagnostics);
  clickRef.current = onNodeClick;
  errorRef.current = onError;
  diagRef.current = onDiagnostics;
  const clickable = typeof onNodeClick === "function";

  // Report diagnostics (after commit, never during render).
  useEffect(() => {
    diagRef.current?.(diagnostics);
    if (hasError) errorRef.current?.(diagnostics);
  }, [diagnostics, hasError]);

  // Interactivity through event delegation on the data attributes emitted by @hpb/core.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || hasError) return;
    const nodes = Array.from(root.querySelectorAll<SVGElement>("[data-hpb-id]"));
    if (nodes.length === 0) return;

    let hovered: string | null = null;
    const dim = (id: string | null) => {
      if (id === hovered) return;
      hovered = id;
      for (const el of nodes) {
        el.style.opacity = id !== null && el.getAttribute("data-hpb-id") !== id ? DIM_OPACITY : "";
      }
    };

    let restore: (() => void) | null = null;
    if (clickable) {
      for (const el of nodes) el.style.cursor = "pointer";
      restore = makeOperable(root);
    }

    const onOver = (e: Event) => {
      if (!hoverDim) return;
      const el = targetOf(e, root);
      dim(el ? el.getAttribute("data-hpb-id") : null);
    };
    const onLeave = () => dim(null);
    const onFocusIn = (e: Event) => {
      if (!hoverDim) return;
      const el = targetOf(e, root);
      dim(el ? el.getAttribute("data-hpb-id") : null);
    };
    const onClick = (e: Event) => {
      const cb = clickRef.current;
      if (!cb) return;
      const el = targetOf(e, root);
      const node = el && nodeOf(el);
      if (node) cb(node);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const cb = clickRef.current;
      if (!cb) return;
      const el = targetOf(e, root);
      const node = el && nodeOf(el);
      if (node) {
        e.preventDefault();
        cb(node);
      }
    };

    root.addEventListener("mouseover", onOver);
    root.addEventListener("mouseleave", onLeave);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onLeave);
    root.addEventListener("click", onClick);
    root.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("mouseover", onOver);
      root.removeEventListener("mouseleave", onLeave);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onLeave);
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKey);
      for (const el of nodes) {
        el.style.opacity = "";
        el.style.cursor = "";
      }
      restore?.();
    };
  }, [svg, hasError, hoverDim, clickable]);

  const classes = ["hpb-diagram", hasError ? "hpb-diagram-error" : "", className ?? ""].filter(Boolean).join(" ");

  return (
    <div
      {...rest}
      ref={rootRef}
      className={classes}
      style={{ maxWidth: "100%", overflowX: "auto", ...style }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
