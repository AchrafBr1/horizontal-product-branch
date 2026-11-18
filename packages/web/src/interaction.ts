/**
 * Hover dimming and click handling for rendered HPB diagrams.
 *
 * Works on any container holding an SVG produced by @hpb/core (a plain element,
 * a shadow root, a React ref). It relies only on the core's DOM contract:
 * every branch and baseline group carries `data-hpb-kind` and `data-hpb-id`.
 */

/** Identifies a clicked node of the diagram. */
export interface HpbNodeRef {
  kind: "branch" | "baseline";
  id: string;
}

export interface InteractionOptions {
  /** Called when a branch or baseline is clicked (or activated with Enter / Space). */
  onNodeClick?: (node: HpbNodeRef, event: Event) => void;
  /** Dim the other nodes while one is hovered or focused (default true). */
  hoverDim?: boolean;
  /** Opacity applied to the dimmed nodes (default 0.35, as in the paper). */
  dimOpacity?: number;
  /**
   * Make branches and baselines reachable with the Tab key (default true). The root
   * <svg> then switches from role="img" to role="group" (aria-roledescription
   * "HPB diagram") and every node becomes a named role="button", so screen readers
   * announce what keyboard users focus. The static markup is restored on detach.
   */
  focusable?: boolean;
}

const NODE_SELECTOR = "[data-hpb-id][data-hpb-kind]";
/** Groups that represent a node as a whole (receive focus / keyboard activation). */
const FOCUS_SELECTOR = "g.hpb-branch[data-hpb-id], g.hpb-baseline[data-hpb-id]";

type Root = Element | ShadowRoot | Document;

function nodeFrom(target: EventTarget | null, root: Root): Element | null {
  const el = target as Element | null;
  if (!el || typeof el.closest !== "function") return null;
  const node = el.closest(NODE_SELECTOR);
  if (!node) return null;
  // Ignore nodes that belong to another diagram nested elsewhere.
  if (root !== node && !(root as Node).contains(node)) return null;
  return node;
}

/** Accessible name of a node group: the text of its own <title> (written by @hpb/core). */
function nodeLabel(el: Element): string {
  for (const child of Array.from(el.children)) {
    if (child.tagName.toLowerCase() === "title") return (child.textContent ?? "").trim();
  }
  return el.getAttribute("data-hpb-id") ?? "";
}

export function nodeRef(el: Element): HpbNodeRef | null {
  const kind = el.getAttribute("data-hpb-kind");
  const id = el.getAttribute("data-hpb-id");
  if ((kind !== "branch" && kind !== "baseline") || id === null) return null;
  return { kind, id };
}

/**
 * Adds hover dimming and click / keyboard activation to the diagram(s) inside `root`.
 * Returns a function that removes every listener and restores the original opacity.
 */
export function attachInteraction(root: Root, options: InteractionOptions = {}): () => void {
  const hoverDim = options.hoverDim !== false;
  const dim = String(options.dimOpacity ?? 0.35);
  let active: string | null = null;
  const dimmed = new Set<HTMLElement | SVGElement>();

  const clear = (): void => {
    for (const el of dimmed) el.style.removeProperty("opacity");
    dimmed.clear();
    active = null;
  };

  const highlight = (id: string | null, scope: Element | null): void => {
    if (!hoverDim || id === active) return;
    clear();
    if (id === null || !scope) return;
    active = id;
    const svg = scope.closest("svg") ?? scope;
    svg.querySelectorAll<SVGElement>(NODE_SELECTOR).forEach((el) => {
      if (el.getAttribute("data-hpb-id") === id) return;
      el.style.opacity = dim;
      dimmed.add(el);
    });
  };

  const onOver = (e: Event): void => {
    const node = nodeFrom(e.target, root);
    highlight(node ? node.getAttribute("data-hpb-id") : null, node);
  };
  const onLeave = (e: Event): void => {
    const next = (e as MouseEvent).relatedTarget as Node | null;
    if (next && (root as Node).contains(next)) return;
    clear();
  };
  const onFocusIn = (e: Event): void => onOver(e);
  const onFocusOut = (e: Event): void => {
    const next = (e as FocusEvent).relatedTarget as Node | null;
    if (!next || !(root as Node).contains(next)) clear();
  };
  const activate = (e: Event): void => {
    if (!options.onNodeClick) return;
    const node = nodeFrom(e.target, root);
    const ref = node && nodeRef(node);
    if (ref) options.onNodeClick(ref, e);
  };
  const onKey = (e: Event): void => {
    const k = (e as KeyboardEvent).key;
    if (k !== "Enter" && k !== " ") return;
    const node = nodeFrom(e.target, root);
    if (!node || !node.matches(FOCUS_SELECTOR)) return;
    e.preventDefault();
    activate(e);
  };

  const focusables: Element[] = [];
  const groups: Element[] = [];
  if (options.focusable !== false) {
    (root as ParentNode).querySelectorAll("svg.hpb").forEach((svg) => {
      if (svg.getAttribute("role") === "img" && !svg.classList.contains("hpb-error")) {
        svg.setAttribute("role", "group");
        svg.setAttribute("aria-roledescription", "HPB diagram");
        groups.push(svg);
      }
    });
    (root as ParentNode).querySelectorAll(FOCUS_SELECTOR).forEach((el) => {
      if (el.getAttribute("tabindex") !== "0") {
        el.setAttribute("tabindex", "0");
        el.setAttribute("role", "button");
        el.setAttribute("aria-label", nodeLabel(el));
        focusables.push(el);
      }
    });
  }

  root.addEventListener("mouseover", onOver);
  root.addEventListener("mouseout", onLeave);
  root.addEventListener("focusin", onFocusIn);
  root.addEventListener("focusout", onFocusOut);
  root.addEventListener("click", activate);
  root.addEventListener("keydown", onKey);

  return () => {
    root.removeEventListener("mouseover", onOver);
    root.removeEventListener("mouseout", onLeave);
    root.removeEventListener("focusin", onFocusIn);
    root.removeEventListener("focusout", onFocusOut);
    root.removeEventListener("click", activate);
    root.removeEventListener("keydown", onKey);
    for (const el of focusables) {
      el.setAttribute("tabindex", "-1");
      el.removeAttribute("role");
      el.removeAttribute("aria-label");
    }
    for (const svg of groups) {
      svg.setAttribute("role", "img");
      svg.removeAttribute("aria-roledescription");
    }
    clear();
  };
}
