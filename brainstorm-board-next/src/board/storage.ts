import { createStore, del, delMany, entries, get, keys, set } from "idb-keyval";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";

import type { Board, BoardFiles } from "./types";

// Boards live in IndexedDB on this device. Board data and images are stored
// separately so autosaving a board doesn't rewrite every PDF page.
const db = createStore("brainstorm-board-next", "kv");

const boardKey = (id: string) => `board:${id}`;
const fileKey = (boardId: string, fileId: string) => `file:${boardId}:${fileId}`;

export async function listBoards(): Promise<Board[]> {
  const all = await entries<string, Board>(db);
  return all
    .filter(([k]) => k.startsWith("board:"))
    .map(([, v]) => v)
    .sort((a, b) => b.updated - a.updated);
}

export const loadBoard = (id: string) => get<Board>(boardKey(id), db);

export const saveBoard = (board: Board) => set(boardKey(board.id), board, db);

export async function loadFiles(boardId: string): Promise<BoardFiles> {
  const prefix = `file:${boardId}:`;
  const all = await entries<string, BinaryFileData>(db);
  const files: BoardFiles = {};
  for (const [k, v] of all) if (k.startsWith(prefix)) files[v.id] = v;
  return files;
}

export const saveFile = (boardId: string, file: BinaryFileData) =>
  set(fileKey(boardId, file.id), file, db);

export async function deleteBoard(id: string) {
  const prefix = `file:${id}:`;
  const fileKeys = (await keys<string>(db)).filter((k) => k.startsWith(prefix));
  await delMany(fileKeys, db);
  await del(boardKey(id), db);
}
