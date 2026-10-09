import { exportToCanvas } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import type { BoardFiles } from "./types";

export async function renderThumbnail(
  elements: readonly ExcalidrawElement[],
  files: BoardFiles,
): Promise<string | undefined> {
  const visible = elements.filter((e) => !e.isDeleted);
  if (!visible.length) return undefined;
  try {
    const canvas = await exportToCanvas({
      elements: visible,
      files,
      appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
      exportPadding: 0,
      maxWidthOrHeight: 320,
    });
    return canvas.toDataURL("image/png");
  } catch {
    return undefined;
  }
}
