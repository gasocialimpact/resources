import { useState } from "react";

import { newFrame } from "./board/frame";
import { framesForBoard } from "./templates/boardTemplates";
import { newId } from "./board/ids";
import type { BoardExport } from "./board/io";
import { loadBoard, loadFiles, saveBoard, saveFile } from "./board/storage";
import type { Board, BoardFiles } from "./board/types";
import { BoardEditor } from "./components/BoardEditor";
import { Landing } from "./components/Landing";

type Open = { board: Board; files: BoardFiles; pdf?: File };

export function App() {
  const [open, setOpen] = useState<Open | null>(null);

  const create = (title: string, templateId: string, pdf?: File) => {
    const board: Board = {
      id: newId("b"),
      title: title || "Untitled Brainstorm",
      updated: Date.now(),
      frames: framesForBoard(templateId),
    };
    void saveBoard(board);
    setOpen({ board, files: {}, pdf });
  };

  const openSaved = async (id: string) => {
    const board = await loadBoard(id);
    if (!board) return;
    setOpen({ board, files: await loadFiles(id) });
  };

  const importBoard = async (data: BoardExport) => {
    const board: Board = { ...data.board, id: newId("b"), updated: Date.now() };
    if (!board.frames.length) board.frames = [newFrame("Frame 1")];
    await saveBoard(board);
    await Promise.all(Object.values(data.files).map((f) => saveFile(board.id, f)));
    setOpen({ board, files: data.files });
  };

  if (!open) {
    return (
      <Landing
        onNew={(t, id) => create(t, id)}
        onNewFromPdf={(t, pdf) => create(t, "blank", pdf)}
        onOpen={openSaved}
        onImport={importBoard}
      />
    );
  }

  return (
    <BoardEditor
      key={open.board.id}
      initialBoard={open.board}
      initialFiles={open.files}
      initialPdf={open.pdf}
      onExit={() => setOpen(null)}
    />
  );
}
