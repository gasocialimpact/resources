import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData, DataURL } from "@excalidraw/excalidraw/types";

import type { Board, BoardFiles, Frame } from "../board/types";

import { BUCKET, supabase } from "./client";

// Calls into the database functions defined in supabase/schema.sql.

export type FrameMeta = {
  id: string;
  position: number;
  title: string;
  width?: number | null;
  height?: number | null;
  is_deleted?: boolean;
};

export type ElementRow = { frame_id: string; element: ExcalidrawElement };

const db = () => {
  if (!supabase) throw new Error("Sharing isn't set up.");
  return supabase;
};

async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

export const frameMeta = (f: Frame, is_deleted = false): FrameMeta => ({
  id: f.id,
  position: f.position ?? 0,
  title: f.title,
  width: f.width ?? null,
  height: f.height ?? null,
  is_deleted,
});

export const createBoard = (id: string, title: string) =>
  rpc("bb_create_board", { p_id: id, p_title: title });

export const setTitle = (id: string, title: string) =>
  rpc("bb_set_title", { p_id: id, p_title: title });

export const upsertFrames = (boardId: string, frames: FrameMeta[]) =>
  frames.length ? rpc("bb_upsert_frames", { p_board: boardId, p_frames: frames }) : Promise.resolve();

export async function upsertElements(boardId: string, rows: ElementRow[]) {
  // Keep each request comfortably small.
  for (let i = 0; i < rows.length; i += 200) {
    await rpc("bb_upsert_elements", { p_board: boardId, p_elements: rows.slice(i, i + 200) });
  }
}

type RemoteBoard = {
  id: string;
  title: string;
  updated_at: string;
  frames: FrameMeta[];
  elements: ElementRow[];
};

/** Load a shared board, or null if there's no board with that id. */
export async function fetchBoard(id: string): Promise<Board | null> {
  const data = (await rpc("bb_get_board", { p_id: id })) as RemoteBoard | null;
  if (!data) return null;
  const byFrame = new Map<string, ExcalidrawElement[]>();
  for (const row of data.elements) {
    const list = byFrame.get(row.frame_id) ?? [];
    list.push(row.element);
    byFrame.set(row.frame_id, list);
  }
  // Elements come back unordered; Excalidraw's fractional `index` restores
  // their stacking order.
  const order = (a: ExcalidrawElement, b: ExcalidrawElement) =>
    (a.index ?? "") < (b.index ?? "") ? -1 : (a.index ?? "") > (b.index ?? "") ? 1 : 0;
  return {
    id: data.id,
    title: data.title,
    updated: Date.parse(data.updated_at),
    shared: true,
    frames: data.frames.map((f) => ({
      id: f.id,
      title: f.title,
      position: f.position,
      width: f.width ?? undefined,
      height: f.height ?? undefined,
      elements: (byFrame.get(f.id) ?? []).sort(order),
    })),
  };
}

/** Upload a whole board (used when sharing a board that was only local). */
export async function uploadBoard(board: Board, files: BoardFiles) {
  board.frames.forEach((f, i) => (f.position ??= i));
  await createBoard(board.id, board.title);
  await upsertFrames(board.id, board.frames.map((f) => frameMeta(f)));
  await upsertElements(
    board.id,
    board.frames.flatMap((f) => f.elements.map((element) => ({ frame_id: f.id, element }))),
  );
  const used = new Set(
    board.frames.flatMap((f) => f.elements.flatMap((e) => (e.type === "image" && e.fileId ? [e.fileId] : []))),
  );
  await Promise.all([...used].filter((id) => files[id]).map((id) => uploadFile(board.id, files[id])));
}

// ---------- Images ----------

const filePath = (boardId: string, fileId: string) => `${boardId}/${fileId}`;

export async function uploadFile(boardId: string, file: BinaryFileData) {
  const blob = await (await fetch(file.dataURL)).blob();
  const { error } = await db()
    .storage.from(BUCKET)
    .upload(filePath(boardId, file.id), blob, { contentType: file.mimeType, upsert: false });
  // Already there (someone else uploaded it, or a retry): fine.
  if (error && !/exists|duplicate/i.test(error.message)) throw new Error(error.message);
}

export async function downloadFile(boardId: string, fileId: string, mimeType?: string) {
  const { data } = db().storage.from(BUCKET).getPublicUrl(filePath(boardId, fileId));
  const res = await fetch(data.publicUrl);
  if (!res.ok) throw new Error(`Image ${fileId} is missing (${res.status}).`);
  const blob = await res.blob();
  const dataURL = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  return {
    id: fileId,
    mimeType: (mimeType ?? blob.type) || "image/png",
    dataURL: dataURL as DataURL,
    created: Date.now(),
  } as BinaryFileData;
}
