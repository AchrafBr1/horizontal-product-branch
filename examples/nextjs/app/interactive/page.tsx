"use client";

// Client component: <HpbDiagram> renders the same SVG (also during SSR) and, once hydrated,
// adds hover dimming and click/keyboard selection.
import { useState } from "react";
import { HpbDiagram } from "@hpb/react";
import type { HpbNodeClick, ThemeName } from "@hpb/react";
import { examples } from "../examples";

export default function InteractivePage() {
  const [key, setKey] = useState("A");
  const [theme, setTheme] = useState<ThemeName>("default");
  const [clicked, setClicked] = useState<HpbNodeClick | null>(null);
  const example = examples.find((e) => e.key === key) ?? examples[0];

  return (
    <>
      <h1>HPB Markup · interactive</h1>
      <p>Hover a branch or a baseline to focus it; click it (or press Enter on it) to select it.</p>
      <div className="toolbar">
        <label>
          Example{" "}
          <select
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setClicked(null);
            }}
          >
            {examples.map((e) => (
              <option key={e.key} value={e.key}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Theme{" "}
          <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeName)}>
            <option value="default">default</option>
            <option value="mono">mono</option>
            <option value="dark">dark</option>
            <option value="auto">auto</option>
          </select>
        </label>
      </div>
      <section className="card">
        <HpbDiagram
          code={example.source}
          theme={theme}
          onNodeClick={setClicked}
          onDiagnostics={(diagnostics) => diagnostics.length > 0 && console.warn("HPB diagnostics", diagnostics)}
        />
        <p className="selection">
          {clicked ? (
            <>
              Selected {clicked.kind} <strong>{clicked.id}</strong>
            </>
          ) : (
            "Nothing selected."
          )}
        </p>
      </section>
    </>
  );
}
