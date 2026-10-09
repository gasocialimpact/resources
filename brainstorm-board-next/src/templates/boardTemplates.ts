import { newFrame } from "../board/frame";
import type { Frame } from "../board/types";

import { frameTemplate, templateElements } from "./frameTemplates";

export type BoardTemplate = {
  id: string;
  name: string;
  description: string;
  /** frame template ids, in order */
  frames: string[];
};

export const BOARD_TEMPLATES: BoardTemplate[] = [
  { id: "blank", name: "Blank board", description: "One empty frame.", frames: ["blank"] },
  {
    id: "brainstorm",
    name: "Brainstorming session",
    description: "Frame a challenge, generate ideas, prioritize, and assign next steps.",
    frames: ["title", "hmw", "blank", "impact-effort", "actions", "parking"],
  },
  {
    id: "retro",
    name: "Retrospective",
    description: "Look back on a project or program and agree what changes.",
    frames: ["title", "retro", "actions"],
  },
  {
    id: "strategy",
    name: "Strategic planning",
    description: "Assess the landscape and map a path forward.",
    frames: ["title", "swot", "stakeholders", "toc", "roadmap", "actions"],
  },
  {
    id: "program",
    name: "Program design",
    description: "Start from the people you serve and design toward impact.",
    frames: ["title", "empathy", "hmw", "toc", "actions"],
  },
];

export const frameFromTemplate = (templateId: string, title?: string): Frame => {
  const t = frameTemplate(templateId);
  return newFrame(title ?? t.name, templateElements(t));
};

export const framesForBoard = (boardTemplateId: string): Frame[] => {
  const bt = BOARD_TEMPLATES.find((b) => b.id === boardTemplateId) ?? BOARD_TEMPLATES[0];
  return bt.frames.map((id) => frameFromTemplate(id));
};
