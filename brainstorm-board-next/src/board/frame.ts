import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/element/transform";
import type { ExcalidrawElement, FileId } from "@excalidraw/excalidraw/element/types";

import { newId } from "./ids";
import type { Frame } from "./types";

// A standard frame is a fixed 16:9 page, like a Jamboard frame, fitted whole
// into the window. Frames holding a portrait PDF page are taller and fit to the
// window's width instead, scrolling top to bottom, so the page is readable.
export const FRAME_W = 1600;
export const FRAME_H = 900;

/** Height a portrait PDF page is laid out at, in frame units */
const PORTRAIT_PAGE_H = 1600;
/** Share of a portrait frame's width the page takes; whiteboard is the rest */
const PORTRAIT_PAGE_SHARE = 0.62;

export const frameSize = (f: Pick<Frame, "width" | "height">) => ({
  width: f.width ?? FRAME_W,
  height: f.height ?? FRAME_H,
});

/**
 * What an element is to the board, kept in Excalidraw's `customData`:
 * - paper: the white page under every frame
 * - page: a PDF page image
 * - template: locked structure from a template (zones, headers, guides)
 * - cluster: a thought cluster container
 */
export type Role = "paper" | "page" | "template" | "cluster";

export const roleOf = (e: ExcalidrawElement): Role | undefined => e.customData?.role;

/** Elements that "Clear frame" keeps */
export const isFrameFurniture = (e: ExcalidrawElement) => {
  const role = roleOf(e);
  return role === "paper" || role === "page" || role === "template";
};

/**
 * Convert skeletons, keeping the ids we gave them, and tag every resulting
 * element (including generated label text) with a role.
 */
export function build(
  skeletons: ExcalidrawElementSkeleton[],
  extra: { role?: Role; locked?: boolean } = {},
): ExcalidrawElement[] {
  const els = convertToExcalidrawElements(skeletons, { regenerateIds: false });
  return els.map((e) => ({
    ...e,
    ...(extra.locked !== undefined ? { locked: extra.locked } : {}),
    ...(extra.role ? { customData: { ...e.customData, role: extra.role } } : {}),
  }));
}

export const paper = (width = FRAME_W, height = FRAME_H) =>
  build(
    [
      {
        type: "rectangle",
        id: newId("paper"),
        x: 0,
        y: 0,
        width,
        height,
        backgroundColor: "#ffffff",
        fillStyle: "solid",
        strokeColor: "#d4d4d4",
        strokeWidth: 1,
        roughness: 0,
        roundness: null,
      },
    ],
    { role: "paper", locked: true },
  );

export const newFrame = (title: string, content: ExcalidrawElement[] = []): Frame => ({
  id: newId("f"),
  title,
  elements: [...paper(), ...content],
});

/**
 * A frame for one PDF page: the page image is pinned to the left edge and
 * locked, and the rest of the frame is open whiteboard. Landscape pages fill
 * the height of a standard frame; portrait pages get a taller frame.
 */
export const newPageFrame = (
  title: string,
  fileId: FileId,
  pageW: number,
  pageH: number,
): Frame => {
  const portrait = pageH > pageW;
  let width: number, height: number, frameW: number, frameH: number;
  if (portrait) {
    height = frameH = PORTRAIT_PAGE_H;
    width = (pageW / pageH) * height;
    frameW = Math.round(width / PORTRAIT_PAGE_SHARE);
  } else {
    frameW = FRAME_W;
    frameH = FRAME_H;
    height = FRAME_H;
    width = (pageW / pageH) * height;
    if (width > FRAME_W) {
      width = FRAME_W;
      height = (pageH / pageW) * width;
    }
  }
  const page = build(
    [{ type: "image", id: newId("page"), x: 0, y: 0, width, height, fileId, status: "saved" }],
    { role: "page", locked: true },
  );
  return {
    id: newId("f"),
    title,
    width: portrait ? frameW : undefined,
    height: portrait ? frameH : undefined,
    elements: [...paper(frameW, frameH), ...page],
  };
};

/** Right edge of any PDF page on the frame, so new content lands beside it */
export const pageRight = (elements: readonly ExcalidrawElement[]) =>
  elements.reduce((r, e) => (roleOf(e) === "page" && !e.isDeleted ? Math.max(r, e.x + e.width) : r), 0);
