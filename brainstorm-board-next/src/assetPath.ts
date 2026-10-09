// Tell Excalidraw to load its fonts from this site (copied into /fonts by
// scripts/copy-fonts.mjs). Must run before Excalidraw is imported.
declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string;
  }
}

window.EXCALIDRAW_ASSET_PATH = new URL(import.meta.env.BASE_URL, window.location.href).href;

export {};
