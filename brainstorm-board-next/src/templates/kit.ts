import { FONT_FAMILY, ROUNDNESS } from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/element/transform";

import { newId } from "../board/ids";

// Small helpers for laying out templates on a 1600 x 900 frame.

export const C = {
  green: "#149a49",
  cream: "#fff1d3",
  lavender: "#dde0fe",
  yellow: "#eec61a",
  teal: "#53c3c2",
  lime: "#66b445",
  orange: "#f15922",
  indigo: "#4750a2",
  mint: "#e0f1d9",
  ink: "#1e1e1e",
  muted: "#6b6b6b",
  rule: "#d4d4d4",
  // light tints for zones
  yellowTint: "#fdf5d3",
  tealTint: "#ddf3f2",
  orangeTint: "#fde4da",
  indigoTint: "#e6e8f6",
  greenTint: "#e3f3e8",
  grayTint: "#f4f4f2",
};

const FONT = FONT_FAMILY.Nunito;
const ROUND = { type: ROUNDNESS.ADAPTIVE_RADIUS };

type S = ExcalidrawElementSkeleton;

export const text = (
  x: number,
  y: number,
  value: string,
  opts: { size?: number; color?: string; width?: number; align?: "left" | "center" | "right" } = {},
): S => ({
  type: "text",
  id: newId("t"),
  x,
  y,
  text: value,
  fontSize: opts.size ?? 24,
  fontFamily: FONT,
  strokeColor: opts.color ?? C.ink,
  textAlign: opts.align ?? "left",
  ...(opts.width ? { width: opts.width, autoResize: false } : {}),
});

/** A tinted area with no border */
export const zone = (x: number, y: number, w: number, h: number, fill: string): S => ({
  type: "rectangle",
  id: newId("z"),
  x,
  y,
  width: w,
  height: h,
  backgroundColor: fill,
  fillStyle: "solid",
  strokeColor: "transparent",
  roughness: 0,
  roundness: ROUND,
});

/** A solid colored pill with centered label, used for section headers */
export const header = (
  x: number,
  y: number,
  w: number,
  label: string,
  fill: string,
  ink = "#ffffff",
  h = 52,
): S => ({
  type: "rectangle",
  id: newId("h"),
  x,
  y,
  width: w,
  height: h,
  backgroundColor: fill,
  fillStyle: "solid",
  strokeColor: "transparent",
  roughness: 0,
  roundness: ROUND,
  label: { text: label, fontSize: 24, fontFamily: FONT, strokeColor: ink } as never,
});

export const line = (x1: number, y1: number, x2: number, y2: number, color = C.rule, width = 2): S => ({
  type: "line",
  id: newId("l"),
  x: x1,
  y: y1,
  points: [
    [0, 0],
    [x2 - x1, y2 - y1],
  ] as never,
  strokeColor: color,
  strokeWidth: width,
  roughness: 0,
});

export const arrow = (x1: number, y1: number, x2: number, y2: number, color = C.muted, width = 2): S => ({
  type: "arrow",
  id: newId("a"),
  x: x1,
  y: y1,
  points: [
    [0, 0],
    [x2 - x1, y2 - y1],
  ] as never,
  strokeColor: color,
  strokeWidth: width,
  roughness: 0,
  endArrowhead: "triangle",
});

export const ellipse = (x: number, y: number, w: number, h: number, fill: string, stroke = "transparent"): S => ({
  type: "ellipse",
  id: newId("e"),
  x,
  y,
  width: w,
  height: h,
  backgroundColor: fill,
  fillStyle: "solid",
  strokeColor: stroke,
  strokeWidth: 2,
  roughness: 0,
});

/** An editable sticky note (not part of the locked structure) */
export const note = (x: number, y: number, value: string, fill: string, ink = C.ink, size = 200): S => ({
  type: "stickynote",
  id: newId("n"),
  x,
  y,
  width: size,
  height: size,
  backgroundColor: fill,
  strokeColor: ink,
  ...(value ? { label: { text: value, fontFamily: FONT } } : {}),
});
