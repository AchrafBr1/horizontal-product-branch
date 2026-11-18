// Pre-publication checks for the hpb packages.
//
//   node scripts/check-release.mjs              offline checks (placeholders, metadata, builds)
//   node scripts/check-release.mjs --registry   also asks the npm registry whether each name is
//                                               free or already published from this repository
//
// Exits with code 1 and a list of problems when something would make the published
// packages (or the README's CDN snippet) point to the wrong place.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const manifests = [join(root, "package.json"), ...readdirSync(join(root, "packages")).map((d) => join(root, "packages", d, "package.json"))].filter(existsSync);

const PLACEHOLDERS = ["OWNER", "TODO", "example.com", "[Author Name]"];

// Public metadata and licensed files outside the manifests: no placeholder may survive in them.
for (const rel of ["paper/hpb.sty", "LICENSE", "CITATION.cff", ".zenodo.json"]) {
  const file = join(root, rel);
  if (!existsSync(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const placeholder of PLACEHOLDERS) {
    if (text.includes(placeholder)) problems.push(`${rel}: contains the placeholder '${placeholder}'`);
  }
}

const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const repoUrl = rootPkg.repository?.url ?? "";

for (const file of manifests) {
  const text = readFileSync(file, "utf8");
  const pkg = JSON.parse(text);
  const rel = file.slice(root.length + 1).replace(/\\/g, "/");
  for (const placeholder of PLACEHOLDERS) {
    if (text.includes(placeholder)) problems.push(`${rel}: contains the placeholder '${placeholder}'`);
  }
  if (pkg.private) continue;
  if (pkg.repository?.url !== repoUrl) problems.push(`${rel}: repository.url differs from the root package.json (${repoUrl})`);
  if (!pkg.license) problems.push(`${rel}: no license`);
  if (!pkg.author) problems.push(`${rel}: no author`);
  const dir = dirname(file);
  if (!existsSync(join(dir, "dist"))) problems.push(`${rel}: dist/ is missing (run pnpm -r build)`);
  if (!existsSync(join(dir, "LICENSE"))) problems.push(`${rel}: LICENSE is missing`);
  if (process.argv.includes("--registry")) {
    try {
      const out = execFileSync("npm", ["view", pkg.name, "repository.url", "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
      const published = JSON.parse(out || "null");
      if (published && !String(published).includes(repoUrl.replace(/^git\+/, "").replace(/\.git$/, ""))) {
        problems.push(`${pkg.name}: already published on npm from ${published}; pick another name or scope`);
      }
    } catch (e) {
      if (!String(e.stderr ?? e.message).includes("E404")) problems.push(`${pkg.name}: npm view failed: ${String(e.stderr ?? e.message).split("\n")[0]}`);
      // E404: the name is free. For a scoped name, the scope must also belong to you:
      // npm org ls <scope> (or create the organisation on npmjs.com) before publishing.
    }
  }
}

if (problems.length > 0) {
  console.error(`Release check failed (${problems.length}):\n` + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log(`Release check passed: ${manifests.length} manifests.`);
