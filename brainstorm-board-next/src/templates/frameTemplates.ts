import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/element/transform";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import { build, FRAME_H, FRAME_W } from "../board/frame";

import { arrow, C, ellipse, header, line, note, text, zone } from "./kit";

type S = ExcalidrawElementSkeleton;

export type FrameTemplate = {
  id: string;
  name: string;
  description: string;
  /** Locked layout (zones, headers, guides) and editable starter notes */
  layout: () => { structure: S[]; notes?: S[] };
};

const M = 48; // outer margin
const W = FRAME_W;
const H = FRAME_H;

/** Title row used by most templates; returns the y where content can start */
const titled = (title: string, prompt?: string): { els: S[]; top: number } => {
  const els: S[] = [zone(M, M, 10, 56, C.green), text(M + 28, M + 4, title, { size: 40 })];
  if (prompt) els.push(text(M + 28, M + 60, prompt, { size: 20, color: C.muted }));
  return { els, top: prompt ? M + 112 : M + 84 };
};

/** Evenly spaced columns, each a tinted zone with a colored header */
const columns = (
  top: number,
  cols: { label: string; head: string; tint: string; ink?: string }[],
  gap = 24,
): S[] => {
  const w = (W - 2 * M - gap * (cols.length - 1)) / cols.length;
  return cols.flatMap((c, i) => {
    const x = M + i * (w + gap);
    return [zone(x, top, w, H - M - top, c.tint), header(x, top, w, c.label, c.head, c.ink)];
  });
};

export const FRAME_TEMPLATES: FrameTemplate[] = [
  {
    id: "blank",
    name: "Blank",
    description: "An empty frame.",
    layout: () => ({ structure: [] }),
  },
  {
    id: "title",
    name: "Title and agenda",
    description: "Open a session with its purpose and plan.",
    layout: () => ({
      structure: [
        zone(0, 0, 560, H, C.green),
        text(64, 300, "Session title", { size: 56, color: "#ffffff", width: 440 }),
        text(64, 440, "Date · Facilitator", { size: 24, color: "#ffffff" }),
        text(640, 96, "Purpose", { size: 32 }),
        text(640, 148, "Why we are here today, in one or two sentences.", {
          size: 22,
          color: C.muted,
          width: 880,
        }),
        line(640, 250, W - 80, 250),
        text(640, 290, "Agenda", { size: 32 }),
        text(640, 346, "1.  Welcome and warm-up\n2.  Explore the challenge\n3.  Generate ideas\n4.  Prioritize\n5.  Next steps", {
          size: 24,
          width: 880,
        }),
      ],
    }),
  },
  {
    id: "hmw",
    name: "How might we",
    description: "Frame the challenge, then fill the space with ideas.",
    layout: () => {
      const banner = header(M, M, W - 2 * M, "How might we ...?", C.indigo, "#ffffff", 120);
      return {
        structure: [
          banner,
          text(M, M + 150, "Ideas", { size: 28 }),
          text(M + 96, M + 156, "Go for quantity. Build on each other. No idea is too big.", {
            size: 20,
            color: C.muted,
          }),
        ],
        notes: [
          note(M, 280, "", C.yellow),
          note(M + 230, 280, "", C.yellow),
          note(M + 460, 280, "", C.yellow),
        ],
      };
    },
  },
  {
    id: "swot",
    name: "SWOT",
    description: "Strengths, weaknesses, opportunities, threats.",
    layout: () => {
      const { els, top } = titled("SWOT analysis");
      const gap = 24;
      const w = (W - 2 * M - gap) / 2;
      const h = (H - M - top - gap) / 2;
      const quad = (col: number, row: number, label: string, head: string, tint: string) => {
        const x = M + col * (w + gap);
        const y = top + row * (h + gap);
        return [zone(x, y, w, h, tint), header(x + 16, y + 16, 260, label, head)];
      };
      return {
        structure: [
          ...els,
          ...quad(0, 0, "Strengths", C.green, C.greenTint),
          ...quad(1, 0, "Weaknesses", C.orange, C.orangeTint),
          ...quad(0, 1, "Opportunities", C.indigo, C.indigoTint),
          ...quad(1, 1, "Threats", "#b8860b", C.yellowTint),
        ],
      };
    },
  },
  {
    id: "retro",
    name: "Keep · Stop · Start",
    description: "A quick retrospective in three columns.",
    layout: () => {
      const { els, top } = titled("Retrospective", "What should we keep doing, stop doing, and start doing?");
      return {
        structure: [
          ...els,
          ...columns(top, [
            { label: "Keep", head: C.green, tint: C.greenTint },
            { label: "Stop", head: C.orange, tint: C.orangeTint },
            { label: "Start", head: C.indigo, tint: C.indigoTint },
          ]),
        ],
      };
    },
  },
  {
    id: "impact-effort",
    name: "Impact / effort",
    description: "Sort ideas into quick wins and big bets.",
    layout: () => {
      const { els, top } = titled("Impact / effort");
      const x0 = M + 60;
      const y1 = H - M - 40;
      const w = W - M - x0;
      const h = y1 - top;
      const cx = x0 + w / 2;
      const cy = top + h / 2;
      const quad = (x: number, y: number, label: string, tint: string, ink: string) => [
        zone(x + 6, y + 6, w / 2 - 12, h / 2 - 12, tint),
        text(x + 24, y + 18, label, { size: 24, color: ink }),
      ];
      return {
        structure: [
          ...els,
          ...quad(x0, top, "Quick wins", C.greenTint, C.green),
          ...quad(cx, top, "Big bets", C.indigoTint, C.indigo),
          ...quad(x0, cy, "Fill-ins", C.grayTint, C.muted),
          ...quad(cx, cy, "Reconsider", C.orangeTint, C.orange),
          arrow(x0, y1, x0, top - 8, C.ink),
          arrow(x0, y1, W - M + 8, y1, C.ink),
          text(M - 8, cy - 14, "Impact", { size: 20, color: C.muted }),
          text(cx - 30, y1 + 8, "Effort", { size: 20, color: C.muted }),
        ],
      };
    },
  },
  {
    id: "empathy",
    name: "Empathy map",
    description: "What the people you serve say, think, do, and feel.",
    layout: () => {
      const { els, top } = titled("Empathy map", "Who are we designing for?");
      const gap = 16;
      const w = (W - 2 * M - gap) / 2;
      const h = (H - M - top - gap) / 2;
      const quad = (col: number, row: number, label: string, head: string, tint: string) => {
        const x = M + col * (w + gap);
        const y = top + row * (h + gap);
        const labelX = col === 0 ? x + 20 : x + w - 20 - 200;
        const labelY = row === 0 ? y + 16 : y + h - 16 - 52;
        return [zone(x, y, w, h, tint), header(labelX, labelY, 200, label, head)];
      };
      const pw = 300;
      const ph = 140;
      return {
        structure: [
          ...els,
          ...quad(0, 0, "Says", C.green, C.greenTint),
          ...quad(1, 0, "Thinks", C.indigo, C.indigoTint),
          ...quad(0, 1, "Does", C.teal, C.tealTint),
          ...quad(1, 1, "Feels", C.orange, C.orangeTint),
          ellipse(W / 2 - pw / 2, top + (H - M - top) / 2 - ph / 2, pw, ph, "#ffffff", C.ink),
          text(W / 2 - 60, top + (H - M - top) / 2 - 18, "Persona", { size: 28 }),
        ],
      };
    },
  },
  {
    id: "stakeholders",
    name: "Stakeholder map",
    description: "Who is at the core, who is involved, who should know.",
    layout: () => {
      const { els } = titled("Stakeholder map");
      const cx = W / 2 + 120;
      const cy = H / 2 + 50;
      const ring = (rx: number, ry: number, fill: string) => ellipse(cx - rx, cy - ry, rx * 2, ry * 2, fill);
      return {
        structure: [
          ...els,
          ring(640, 380, C.grayTint),
          ring(440, 270, C.indigoTint),
          ring(220, 140, C.lavender),
          text(cx - 40, cy - 18, "Core", { size: 28, color: C.indigo }),
          text(cx - 70, cy - 230, "Involved", { size: 24, color: C.indigo }),
          text(cx - 50, cy - 350, "Aware", { size: 24, color: C.muted }),
          text(M, 200, "Core: decide and do the work\nInvolved: contribute or are affected\nAware: should be kept informed", {
            size: 18,
            color: C.muted,
          }),
        ],
      };
    },
  },
  {
    id: "toc",
    name: "Theory of change",
    description: "From inputs and activities to outcomes and impact.",
    layout: () => {
      const { els, top } = titled("Theory of change", "If we invest these inputs in these activities, then ...");
      const cols = [
        { label: "Inputs", head: C.teal, tint: C.tealTint },
        { label: "Activities", head: C.indigo, tint: C.indigoTint },
        { label: "Outputs", head: C.lime, tint: C.greenTint, ink: C.ink },
        { label: "Outcomes", head: C.yellow, tint: C.yellowTint, ink: C.ink },
        { label: "Impact", head: C.green, tint: C.greenTint },
      ];
      const gap = 40;
      const w = (W - 2 * M - gap * (cols.length - 1)) / cols.length;
      const arrows = cols.slice(1).map((_, i) => {
        const x = M + (i + 1) * (w + gap) - gap + 6;
        return arrow(x, top + 26, x + gap - 12, top + 26, C.ink);
      });
      return { structure: [...els, ...columns(top, cols, gap), ...arrows] };
    },
  },
  {
    id: "roadmap",
    name: "Now · Next · Later",
    description: "A simple roadmap across three horizons.",
    layout: () => {
      const { els, top } = titled("Roadmap");
      return {
        structure: [
          ...els,
          arrow(M, top + 8, W - M, top + 8, C.ink, 3),
          ...columns(top + 40, [
            { label: "Now", head: C.green, tint: C.greenTint },
            { label: "Next", head: C.teal, tint: C.tealTint },
            { label: "Later", head: C.indigo, tint: C.indigoTint },
          ]),
        ],
      };
    },
  },
  {
    id: "actions",
    name: "Action plan",
    description: "Who does what, by when.",
    layout: () => {
      const { els, top } = titled("Action plan");
      const colsX = [M, M + 760, M + 1060, M + 1300];
      const heads = ["Action", "Owner", "Due", "Status"];
      const rowH = 92;
      const rows = Math.floor((H - M - top - 56) / rowH);
      return {
        structure: [
          ...els,
          zone(M, top, W - 2 * M, 52, C.green),
          ...heads.map((h, i) => text(colsX[i] + 20, top + 12, h, { size: 22, color: "#ffffff" })),
          ...Array.from({ length: rows }, (_, r) => line(M, top + 52 + (r + 1) * rowH, W - M, top + 52 + (r + 1) * rowH)),
          ...colsX.slice(1).map((x) => line(x, top + 52, x, top + 52 + rows * rowH)),
        ],
      };
    },
  },
  {
    id: "parking",
    name: "Questions · Parking lot",
    description: "Capture open questions and ideas to revisit.",
    layout: () => {
      const { els, top } = titled("Open items");
      return {
        structure: [
          ...els,
          ...columns(top, [
            { label: "Open questions", head: C.indigo, tint: C.indigoTint },
            { label: "Parking lot", head: "#b8860b", tint: C.yellowTint },
          ]),
        ],
      };
    },
  },
];

export const frameTemplate = (id: string) =>
  FRAME_TEMPLATES.find((t) => t.id === id) ?? FRAME_TEMPLATES[0];

/**
 * Elements a template adds on top of the paper. Shapes (zones, headers, rules)
 * are locked so they don't move while people work; free text such as titles
 * and prompts stays editable. Starter notes are ordinary notes.
 */
export function templateElements(t: FrameTemplate): ExcalidrawElement[] {
  const { structure, notes = [] } = t.layout();
  const laid = build(structure, { role: "template" }).map((e) =>
    e.type === "text" && !e.containerId ? e : { ...e, locked: true },
  );
  return [...laid, ...build(notes)];
}
