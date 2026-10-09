import { useCallback, useEffect, useRef, useState } from "react";

import { newFrame } from "./board/frame";
import { newId } from "./board/ids";
import type { BoardExport } from "./board/io";
import { loadBoard, loadFiles, saveBoard, saveFile } from "./board/storage";
import type { Board, BoardFiles } from "./board/types";
import { BoardEditor } from "./components/BoardEditor";
import { Landing } from "./components/Landing";
import { supabase } from "./sync/client";
import { isShareId, newShareId } from "./sync/ids";
import { fetchBoard, uploadBoard } from "./sync/remote";
import { framesForBoard } from "./templates/boardTemplates";

type Open = { board: Board; files: BoardFiles; pdf?: File };

// A shared board's address is the app URL plus #b=<share id>.
const boardIdFromHash = () => {
  const m = window.location.hash.match(/^#b=([A-Za-z0-9_-]+)$/);
  return m && isShareId(m[1]) ? m[1] : null;
};
const setHash = (id: string | null) =>
  history.replaceState(null, "", id ? `#b=${id}` : window.location.pathname + window.location.search);

export function App() {
  const [open, setOpen] = useState<Open | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const openId = useRef<string | null>(null);
  openId.current = open?.board.id ?? null;

  /** Open a shared board: latest from the server, or this device's copy if offline. */
  const openShared = useCallback(async (id: string) => {
    if (openId.current === id) return;
    openId.current = id;
    setLoading("Opening board...");
    try {
      let board: Board | null | undefined = null;
      try {
        board = await fetchBoard(id);
      } catch (err) {
        console.error(err);
        board = await loadBoard(id);
        if (board) alert("Couldn't reach the server, so this is the copy saved on this device.");
      }
      if (!board) {
        openId.current = null;
        alert("That board wasn't found. The link may be incomplete.");
        setHash(null);
        return;
      }
      await saveBoard(board);
      setHash(id);
      setOpen({ board, files: await loadFiles(id) });
    } finally {
      setLoading(null);
    }
  }, []);

  // Follow #b=<id> links, including when the hash changes in an open tab.
  useEffect(() => {
    const go = () => {
      const id = boardIdFromHash();
      if (id) void openShared(id);
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, [openShared]);

  const create = async (title: string, templateId: string, pdf?: File) => {
    const board: Board = {
      id: supabase ? newShareId() : newId("b"),
      title: title || "Untitled Brainstorm",
      updated: Date.now(),
      frames: framesForBoard(templateId),
    };
    // New boards are shared from the start when sharing is set up; if the
    // server can't be reached the board stays on this device for now.
    if (supabase) {
      setLoading("Creating board...");
      try {
        await uploadBoard(board, {});
        board.shared = true;
      } catch (err) {
        console.error(err);
        board.id = newId("b");
      } finally {
        setLoading(null);
      }
    }
    await saveBoard(board);
    if (board.shared) setHash(board.id);
    setOpen({ board, files: {}, pdf });
  };

  const openSaved = async (id: string) => {
    const board = await loadBoard(id);
    if (!board) return;
    if (board.shared) return openShared(id);
    setOpen({ board, files: await loadFiles(id) });
  };

  const importBoard = async (data: BoardExport) => {
    const board: Board = { ...data.board, id: newId("b"), shared: false, updated: Date.now() };
    if (!board.frames.length) board.frames = [newFrame("Frame 1")];
    await saveBoard(board);
    await Promise.all(Object.values(data.files).map((f) => saveFile(board.id, f)));
    setOpen({ board, files: data.files });
  };

  if (loading) return <div className="loading">{loading}</div>;

  if (!open) {
    return (
      <Landing
        onNew={(t, id) => void create(t, id)}
        onNewFromPdf={(t, pdf) => void create(t, "blank", pdf)}
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
      onExit={() => {
        setHash(null);
        setOpen(null);
      }}
      onShared={(id) => setHash(id)}
    />
  );
}
