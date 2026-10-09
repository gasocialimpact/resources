import type { Board, BoardFiles } from "./types";

// A board exported to a single file, images included.
export type BoardExport = {
  type: "brainstorm-board";
  version: 1;
  board: Board;
  files: BoardFiles;
};

export function downloadBoard(board: Board, files: BoardFiles) {
  const used = new Set<string>();
  for (const f of board.frames)
    for (const e of f.elements) if (e.type === "image" && e.fileId) used.add(e.fileId);
  const data: BoardExport = {
    type: "brainstorm-board",
    version: 1,
    board,
    files: Object.fromEntries(Object.entries(files).filter(([id]) => used.has(id))),
  };
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    (board.title || "brainstorm-board").replace(/[^a-z0-9]+/gi, "-").toLowerCase() +
    ".brainstorm.json";
  a.click();
  URL.revokeObjectURL(url);
}

export async function readBoardFile(file: File): Promise<BoardExport> {
  const data = JSON.parse(await file.text());
  if (data?.type !== "brainstorm-board" || !Array.isArray(data.board?.frames)) {
    throw new Error("That file is not a Brainstorm Board export.");
  }
  return data as BoardExport;
}
