import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import { C, header, note, zone } from "../templates/kit";

import { build, roleOf } from "./frame";
import { newId } from "./ids";

// A thought cluster is a top-to-bottom section of a frame: a colored header
// with a prompt, a tinted column, and a couple of starter notes. It sits inside
// an Excalidraw frame element, so notes dropped in move with the cluster and
// the cluster moves as one when dragged by its name.

export type ClusterKind = {
  label: string;
  prompt: string;
  head: string;
  ink: string;
  tint: string;
  noteColor: string;
  noteInk: string;
};

export const CLUSTERS: ClusterKind[] = [
  { label: "Ideas", prompt: "What if we...", head: "#b8860b", ink: "#ffffff", tint: C.yellowTint, noteColor: C.yellow, noteInk: C.ink },
  { label: "Questions", prompt: "How might we...", head: C.indigo, ink: "#ffffff", tint: C.indigoTint, noteColor: C.lavender, noteInk: C.ink },
  { label: "Insights", prompt: "We noticed that...", head: C.green, ink: "#ffffff", tint: C.greenTint, noteColor: C.mint, noteInk: C.ink },
  { label: "Risks", prompt: "This could break if...", head: C.orange, ink: "#ffffff", tint: C.orangeTint, noteColor: C.orange, noteInk: "#ffffff" },
  { label: "Actions", prompt: "Next step · Owner · Due", head: "#2a8f8e", ink: "#ffffff", tint: C.tealTint, noteColor: C.teal, noteInk: C.ink },
  { label: "Decisions", prompt: "We agreed to...", head: "#4a8a31", ink: "#ffffff", tint: C.greenTint, noteColor: C.lime, noteInk: C.ink },
  { label: "Parking lot", prompt: "Revisit later", head: "#8a6d2b", ink: "#ffffff", tint: C.grayTint, noteColor: C.cream, noteInk: C.ink },
  { label: "Votes", prompt: "+1 the ideas you back", head: C.indigo, ink: "#ffffff", tint: C.indigoTint, noteColor: C.indigo, noteInk: "#ffffff" },
];

export const CLUSTER_W = 300;
const PAD = 14;
const MARGIN = 24;
const NOTE = CLUSTER_W - 2 * PAD;

/** Build a cluster whose column runs the full height of the frame */
export function buildCluster(kind: ClusterKind, x: number, frameHeight: number): ExcalidrawElement[] {
  const top = MARGIN + 20; // room for the frame name above
  const height = frameHeight - top - MARGIN;
  const body = [
    zone(x, top, CLUSTER_W, height, kind.tint),
    header(x + PAD, top + PAD, CLUSTER_W - 2 * PAD, kind.prompt, kind.head, kind.ink, 56),
  ];
  const notes = [0, 1].map((i) =>
    note(x + PAD, top + PAD + 56 + 16 + i * (NOTE * 0.7 + 14), "", kind.noteColor, kind.noteInk, NOTE),
  );
  // Notes start shorter than wide so more fit down the column.
  for (const n of notes) (n as { height: number }).height = Math.round(NOTE * 0.7);
  const frameId = newId("cluster");
  const bodyIds = new Set(body.map((b) => b.id));
  // Converted together so the children get the cluster as their frame.
  const els = build([
    ...body,
    ...notes,
    {
      type: "frame",
      id: frameId,
      x,
      y: top,
      width: CLUSTER_W,
      height,
      name: kind.label,
      children: [...body, ...notes].map((c) => c.id!),
    },
  ]);
  // The column and header are the cluster's look, not things to edit.
  return els.map((e) => {
    if (e.id === frameId) return { ...e, customData: { role: "cluster" } };
    const isBody = bodyIds.has(e.id) || (e.type === "text" && !!e.containerId && bodyIds.has(e.containerId));
    return isBody ? { ...e, locked: true } : e;
  });
}

/** Next free x for a cluster, left to right after any PDF page */
export function nextClusterX(elements: readonly ExcalidrawElement[], start: number, frameWidth: number) {
  const taken = elements.filter((e) => !e.isDeleted && roleOf(e) === "cluster").map((e) => e.x + e.width);
  const x = Math.max(start + MARGIN, ...taken.map((r) => r + MARGIN));
  return Math.min(x, frameWidth - CLUSTER_W - MARGIN);
}
