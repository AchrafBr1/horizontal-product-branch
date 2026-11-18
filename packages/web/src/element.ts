/**
 * <hpb-diagram> custom element.
 *
 *   <hpb-diagram theme="default">
 *     line A "Product A"
 *     release v1.0
 *     issue X-1 "Crash on boot"
 *     release v1.0.1 merges X-1
 *   </hpb-diagram>
 *
 *   <hpb-diagram src="diagrams/product-a.hpb" show-closed="false"></hpb-diagram>
 *
 * Attributes: src, theme (default | mono | dark | auto), show-closed, labels, show-title,
 * fit (scale to width), no-interaction.
 * Before the element is defined its text would show as one run-together paragraph:
 * add `hpb-diagram:not(:defined){display:block;white-space:pre;visibility:hidden}` to the page.
 * Properties: code (overrides text content and src), svg, diagnostics (read-only).
 * Events: hpb-node-click {kind, id}, hpb-render {svg, diagnostics}, hpb-error {error} (src could not be loaded).
 */
import { renderDiagram } from "@hpb/core";
import type { Diagnostic, HpbOptions, LabelMode, ThemeName } from "@hpb/core";
import { attachInteraction } from "./interaction";
import { formatDiagnostics } from "./autorender";

export const HPB_ELEMENT_TAG = "hpb-diagram";

/** Public surface of the <hpb-diagram> element. */
export interface HpbDiagramElement extends HTMLElement {
  /** Source text; when set, takes precedence over the text content and the src attribute. Set null to go back. */
  code: string | null;
  /** Last rendered SVG markup. */
  readonly svg: string;
  /** Diagnostics of the last render. */
  readonly diagnostics: Diagnostic[];
  /** Re-renders now (it also re-renders automatically on attribute and content changes). */
  refresh(): void;
}

export interface HpbDiagramElementConstructor {
  new (): HpbDiagramElement;
  readonly observedAttributes: string[];
}

const STYLE = `
:host { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }
:host([hidden]) { display: none; }
.hpb-wrap svg { display: block; }
:host([fit]) .hpb-wrap svg { width: 100%; height: auto; }
.hpb-wrap [data-hpb-id] { transition: opacity .15s ease; }
:host(:not([no-interaction])) .hpb-wrap g.hpb-branch,
:host(:not([no-interaction])) .hpb-wrap g.hpb-baseline,
:host(:not([no-interaction])) .hpb-wrap g.hpb-branch-front,
:host(:not([no-interaction])) .hpb-wrap g.hpb-baseline-front { cursor: pointer; }
.hpb-wrap g[data-hpb-id]:focus { outline: none; }
.hpb-wrap g[data-hpb-id]:focus-visible { outline: 2px solid #0EA5E9; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .hpb-wrap [data-hpb-id] { transition: none; } }
`;

let ctor: HpbDiagramElementConstructor | null = null;

/** Builds the element class lazily so importing this module never touches `HTMLElement` during SSR. */
export function getHpbDiagramElement(): HpbDiagramElementConstructor {
  if (ctor) return ctor;
  if (typeof HTMLElement === "undefined") {
    throw new Error("<hpb-diagram> needs a DOM (HTMLElement is not defined in this environment).");
  }

  class HpbDiagram extends HTMLElement implements HpbDiagramElement {
    static get observedAttributes(): string[] {
      return ["src", "theme", "show-closed", "labels", "show-title", "no-interaction"];
    }

    private _code: string | null = null;
    private _svg = "";
    private _diagnostics: Diagnostic[] = [];
    private _wrap: HTMLDivElement | null = null;
    private _observer: MutationObserver | null = null;
    private _detach: (() => void) | null = null;
    private _queued = false;
    private _srcText: string | null = null;
    private _srcLoaded: string | null = null;
    private _loadToken = 0;

    get code(): string | null {
      return this._code;
    }
    set code(value: string | null) {
      this._code = value === null || value === undefined ? null : String(value);
      this.queue();
    }
    get svg(): string {
      return this._svg;
    }
    get diagnostics(): Diagnostic[] {
      return this._diagnostics.slice();
    }

    connectedCallback(): void {
      if (!this._wrap) {
        const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
        const style = document.createElement("style");
        style.textContent = STYLE;
        this._wrap = document.createElement("div");
        this._wrap.className = "hpb-wrap";
        this._wrap.setAttribute("part", "diagram");
        root.append(style, this._wrap);
      }
      if (!this._observer && typeof MutationObserver !== "undefined") {
        this._observer = new MutationObserver(() => {
          if (this._code === null && !this.hasAttribute("src")) this.queue();
        });
        this._observer.observe(this, { childList: true, characterData: true, subtree: true });
      }
      this.loadSrcIfNeeded();
      this.queue();
    }

    disconnectedCallback(): void {
      this._observer?.disconnect();
      this._observer = null;
    }

    attributeChangedCallback(name: string, oldValue: string | null, value: string | null): void {
      if (oldValue === value) return;
      if (name === "src") {
        this._srcText = null;
        this._srcLoaded = null;
        if (this.isConnected) this.loadSrcIfNeeded();
      }
      this.queue();
    }

    refresh(): void {
      this.renderNow();
    }

    private queue(): void {
      if (this._queued || !this.isConnected) return;
      this._queued = true;
      queueMicrotask(() => {
        this._queued = false;
        if (this.isConnected) this.renderNow();
      });
    }

    private loadSrcIfNeeded(): void {
      const src = this.getAttribute("src");
      if (!src || this._srcLoaded === src) return;
      this._srcLoaded = src;
      const token = ++this._loadToken;
      if (typeof fetch !== "function") return;
      fetch(src)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status} loading ${src}`);
          return r.text();
        })
        .then((text) => {
          if (token !== this._loadToken) return;
          this._srcText = text;
          this.renderNow();
        })
        .catch((error: unknown) => {
          if (token !== this._loadToken) return;
          this._srcText = null;
          this.dispatchEvent(new CustomEvent("hpb-error", { detail: { error }, bubbles: true, composed: true }));
          this.showMessage(`Could not load ${src}`);
        });
    }

    private source(): string | null {
      if (this._code !== null) return this._code;
      if (this.hasAttribute("src")) return this._srcText; // null while loading
      return this.textContent ?? "";
    }

    private options(): HpbOptions {
      const o: HpbOptions = { onError: "box" };
      const theme = this.getAttribute("theme");
      if (theme) o.theme = theme as ThemeName;
      const labels = this.getAttribute("labels");
      if (labels) o.labels = labels as LabelMode;
      const closed = this.getAttribute("show-closed");
      if (closed !== null) o.showClosed = closed !== "false";
      const title = this.getAttribute("show-title");
      if (title !== null) o.showTitle = title !== "false";
      if (this.id) o.idPrefix = `${this.id}-hpb`;
      return o;
    }

    private showMessage(text: string): void {
      if (!this._wrap) return;
      this._detach?.();
      this._detach = null;
      this._wrap.textContent = "";
      const p = document.createElement("p");
      p.setAttribute("part", "message");
      p.style.cssText = "margin:0;padding:8px 12px;font:13px system-ui,sans-serif;color:#B91C1C;border:1px solid #FCA5A5;border-radius:4px;background:#FEF2F2";
      p.textContent = text;
      this._wrap.append(p);
    }

    private renderNow(): void {
      if (!this._wrap) return;
      const source = this.source();
      if (source === null) return; // src still loading
      const out = renderDiagram(source, this.options());
      this._diagnostics = out.diagnostics;
      this._svg = out.svg;
      const bad = out.diagnostics.filter((d) => d.code === "E-OPTION");
      if (bad.length > 0 && typeof console !== "undefined") console.warn(`[hpb] <hpb-diagram>:\n${formatDiagnostics(bad)}`);
      this._detach?.();
      this._detach = null;
      this._wrap.innerHTML = this._svg;
      if (!this.hasAttribute("no-interaction")) {
        this._detach = attachInteraction(this._wrap, {
          onNodeClick: (node) => {
            this.dispatchEvent(new CustomEvent("hpb-node-click", { detail: node, bubbles: true, composed: true }));
          },
        });
      }
      this.dispatchEvent(
        new CustomEvent("hpb-render", { detail: { svg: this._svg, diagnostics: this.diagnostics }, bubbles: false })
      );
    }
  }

  ctor = HpbDiagram as unknown as HpbDiagramElementConstructor;
  return ctor;
}

/** Registers <hpb-diagram> (or another tag name). Safe to call several times and during SSR (no-op). */
export function defineHpbElement(tagName: string = HPB_ELEMENT_TAG): void {
  if (typeof customElements === "undefined" || typeof HTMLElement === "undefined") return;
  if (customElements.get(tagName)) return;
  const C = getHpbDiagramElement();
  // A class can only be registered once: subclass it for additional tag names.
  const already = Object.prototype.hasOwnProperty.call(C, "__hpbDefined");
  const Klass = already ? class extends (C as unknown as typeof HTMLElement) {} : C;
  if (!already) Object.defineProperty(C, "__hpbDefined", { value: true });
  customElements.define(tagName, Klass as unknown as CustomElementConstructor);
}

declare global {
  interface HTMLElementTagNameMap {
    "hpb-diagram": HpbDiagramElement;
  }
  interface HTMLElementEventMap {
    "hpb-node-click": CustomEvent<import("./interaction").HpbNodeRef>;
  }
}
