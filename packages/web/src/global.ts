/**
 * <script> bundle (dist/hpb.min.js): exposes window.HPB, registers <hpb-diagram>
 * and auto-renders `pre.hpb, code.language-hpb, .hpb` blocks on DOMContentLoaded.
 * Call `HPB.initialize({ startOnLoad: false })` right after the script tag to opt out.
 */
import { HPB } from "./index";
import { scheduleStartOnLoad } from "./autorender";

declare global {
  interface Window {
    HPB: typeof HPB;
  }
}

if (typeof window !== "undefined") {
  window.HPB = HPB;
  HPB.defineElement();
  scheduleStartOnLoad();
}
