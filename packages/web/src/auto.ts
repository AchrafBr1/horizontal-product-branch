/**
 * Side-effect entry: `import "@hpb/web/auto"` registers <hpb-diagram> and renders
 * every HPB block of the page when the DOM is ready (call HPB.initialize to tune it).
 */
import { HPB } from "./index";
import { scheduleStartOnLoad } from "./autorender";

HPB.defineElement();
scheduleStartOnLoad();

export * from "./index";
export { default } from "./index";
