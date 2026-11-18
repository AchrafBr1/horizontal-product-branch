// The reference examples A-E, loaded as strings through the *.hpb webpack rule in next.config.mjs.
import A from "../../fixtures/A-firmware-line.hpb";
import B from "../../fixtures/B-release-gate.hpb";
import C from "../../fixtures/C-hardware-revision.hpb";
import D from "../../fixtures/D-discard-retarget.hpb";
import E from "../../fixtures/E-collapsed-history.hpb";

export interface Example {
  key: string;
  label: string;
  source: string;
}

export const examples: Example[] = [
  { key: "A", label: "A · firmware line", source: A },
  { key: "B", label: "B · release gate", source: B },
  { key: "C", label: "C · hardware revision", source: C },
  { key: "D", label: "D · discard and re-target", source: D },
  { key: "E", label: "E · collapsed history", source: E },
];
