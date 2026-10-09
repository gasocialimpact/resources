import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

/** Excalidraw's rule for which copy of an element wins */
export const isNewer = (a: ExcalidrawElement, b: ExcalidrawElement | undefined) =>
  !b || a.version > b.version || (a.version === b.version && a.versionNonce < b.versionNonce);

/**
 * Merge remote elements into a frame that isn't on screen. Elements keep
 * their order; new ones go on top.
 */
export function mergeElements(
  local: readonly ExcalidrawElement[],
  remote: readonly ExcalidrawElement[],
): ExcalidrawElement[] {
  const incoming = new Map(remote.map((e) => [e.id, e]));
  const out = local.map((e) => {
    const r = incoming.get(e.id);
    if (!r) return e;
    incoming.delete(e.id);
    return isNewer(r, e) ? r : e;
  });
  return [...out, ...incoming.values()];
}
