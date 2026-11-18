// Keeps the documentation honest: every ```hpb fence in the docs and READMEs
// (which remark-hpb would render) and every docs/examples/*.hpb file must be
// free of errors.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validate } from "@hpb/core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const exists = (p: string) => fs.existsSync(path.join(root, p));

const markdownFiles = [
  "README.md",
  "docs/language.md",
  "docs/integration.md",
  "packages/remark-hpb/README.md",
  "packages/cli/README.md",
].filter(exists);

describe("documentation examples", () => {
  for (const file of markdownFiles) {
    it(`${file}: every hpb fence is valid`, () => {
      const md = fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n?/g, "\n");
      const re = /^```hpb\n([\s\S]*?)^```/gm;
      const problems: string[] = [];
      for (let m = re.exec(md); m; m = re.exec(md)) {
        const at = md.slice(0, m.index).split("\n").length;
        for (const d of validate(m[1])) {
          if (d.severity === "error") problems.push(`${file}:${at + d.line}:${d.col} ${d.code} ${d.message}`);
        }
      }
      expect(problems).toEqual([]);
    });
  }

  const dir = path.join(root, "docs/examples");
  const sources = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".hpb")) : [];
  for (const f of sources) {
    it(`docs/examples/${f} is valid`, () => {
      const errors = validate(fs.readFileSync(path.join(dir, f), "utf8")).filter((d) => d.severity === "error");
      expect(errors).toEqual([]);
    });
  }
});
