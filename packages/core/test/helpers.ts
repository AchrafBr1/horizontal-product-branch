import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = ["A-firmware-line", "B-release-gate", "C-hardware-revision", "D-discard-retarget", "E-collapsed-history"];

export function fixture(name: string): string {
  return fs.readFileSync(path.join(here, "fixtures", `${name}.hpb`), "utf8");
}
