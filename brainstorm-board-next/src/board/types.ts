import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";

export type Frame = {
  id: string;
  title: string;
  /** Frame size in scene units. Omitted for the standard 1600 x 900 frame. */
  width?: number;
  height?: number;
  /** Excalidraw elements drawn on this frame, in scene coordinates */
  elements: readonly ExcalidrawElement[];
  /** small PNG data URL for the frame rail */
  thumbnail?: string;
};

export type Board = {
  id: string;
  title: string;
  updated: number;
  frames: Frame[];
};

/** Images used by a board (PDF pages, pasted pictures), keyed by file id */
export type BoardFiles = Record<string, BinaryFileData>;
