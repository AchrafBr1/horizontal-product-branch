// Server component: the SVG is produced on the server (at build time for this static page).
// No client JavaScript is needed to display the diagrams.
import { renderHpbToString } from "@hpb/react/server";
import { examples } from "./examples";

export default function Page() {
  return (
    <>
      <h1>HPB Markup · server-rendered</h1>
      <p>
        Each diagram below is rendered on the server with <code>renderHpbToString</code> from{" "}
        <code>@hpb/react/server</code>; the browser receives plain SVG.
      </p>
      {examples.map((ex) => (
        <section key={ex.key} className="card">
          <h2>{ex.label}</h2>
          <div className="hpb-diagram" dangerouslySetInnerHTML={{ __html: renderHpbToString(ex.source, { idPrefix: `ex-${ex.key}` }) }} />
          <details>
            <summary>Source</summary>
            <pre>{ex.source}</pre>
          </details>
        </section>
      ))}
    </>
  );
}
