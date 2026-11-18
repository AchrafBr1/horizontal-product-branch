import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// (the DOM environment replaces the global URL class, so build paths from strings)
const dir = join(dirname(fileURLToPath(import.meta.url)), "../../../examples/fixtures/");

export function fixture(name: string): string {
  const file = readdirSync(dir).find((f) => f.startsWith(name));
  if (!file) throw new Error(`fixture ${name} not found`);
  return readFileSync(join(dir, file), "utf8");
}

export const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));
