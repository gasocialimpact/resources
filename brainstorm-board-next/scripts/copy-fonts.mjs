// Copies Excalidraw's fonts next to the app so they load from our own site
// instead of a third-party CDN.
import { cpSync, rmSync } from "node:fs";

const src = new URL("../node_modules/@excalidraw/excalidraw/dist/prod/fonts", import.meta.url);
const dest = new URL("../public/fonts", import.meta.url);
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
