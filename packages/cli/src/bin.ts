/**
 * `hpb` executable. Copyright (c) 2026 Achraf Bouchtarouif El Khiat. MIT License.
 */
import { run } from "./index";

run(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    process.stderr.write(`hpb: ${String(e)}\n`);
    process.exitCode = 2;
  }
);
