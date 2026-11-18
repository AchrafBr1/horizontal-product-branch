import { useState } from "react";
import { HpbDiagram } from "@hpb/react";
import type { Diagnostic, HpbNodeClick, ThemeName } from "@hpb/react";
import { examples } from "./examples";

export function App() {
  const [selected, setSelected] = useState(examples[0]?.key ?? "");
  const [code, setCode] = useState(examples[0]?.source ?? "");
  const [theme, setTheme] = useState<ThemeName>("default");
  const [showClosed, setShowClosed] = useState(true);
  const [clicked, setClicked] = useState<HpbNodeClick | null>(null);

  // Filled by <HpbDiagram onDiagnostics> after every render ([] once the source is clean).
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);

  const pick = (key: string) => {
    const ex = examples.find((e) => e.key === key);
    setSelected(key);
    if (ex) setCode(ex.source);
    setClicked(null);
  };

  return (
    <main className="app">
      <header>
        <h1>HPB Markup · Vite + React</h1>
        <p>
          Edit the text on the left; the diagram updates as you type. Hover a branch or baseline to focus it, click
          it to select it.
        </p>
      </header>

      <div className="toolbar">
        <label>
          Example{" "}
          <select value={selected} onChange={(e) => pick(e.target.value)}>
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
        <label>
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show merged
          and discarded branches
        </label>
      </div>

      <div className="split">
        <section className="editor">
          <textarea
            aria-label="HPB Markup source"
            spellCheck={false}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setSelected("");
            }}
          />
          <ul className="diagnostics" aria-live="polite">
            {diagnostics.length === 0 ? (
              <li className="ok">No problems found.</li>
            ) : (
              diagnostics.map((d, i) => (
                <li key={i} className={d.severity}>
                  <code>
                    {d.line}:{d.col} {d.code}
                  </code>{" "}
                  {d.message}
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="preview">
          <HpbDiagram
            code={code}
            theme={theme}
            showClosed={showClosed}
            onNodeClick={setClicked}
            onDiagnostics={setDiagnostics}
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
      </div>
    </main>
  );
}
