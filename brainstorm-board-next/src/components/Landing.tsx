import { useEffect, useRef, useState } from "react";

import { readBoardFile } from "../board/io";
import { deleteBoard, listBoards } from "../board/storage";
import type { Board } from "../board/types";

import { BoardTemplateGrid } from "./TemplatePicker";

type Props = {
  onNew: (title: string, templateId: string) => void;
  onNewFromPdf: (title: string, pdf: File) => void;
  onOpen: (id: string) => void;
  onImport: (data: Awaited<ReturnType<typeof readBoardFile>>) => void;
};

export function Landing({ onNew, onNewFromPdf, onOpen, onImport }: Props) {
  const [title, setTitle] = useState("");
  const [boards, setBoards] = useState<Board[]>([]);
  const pdfInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const refresh = () => listBoards().then(setBoards).catch(() => setBoards([]));
  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="landing">
      <main className="landing-main">
        <h1>Brainstorm Board</h1>
        <p className="muted">Start a board, add frames, and fill them with ideas.</p>
        <label className="field-label" htmlFor="newTitle">
          Board name
        </label>
        <input
          id="newTitle"
          className="text-input"
          placeholder="Untitled Brainstorm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onNew(title.trim(), "blank")}
        />
        <div className="section-row">
          <h2>Start from a template</h2>
          <div className="landing-actions">
            <button className="btn" onClick={() => pdfInput.current?.click()}>
              Start from a PDF
            </button>
            <button className="btn" onClick={() => importInput.current?.click()}>
              Open a file
            </button>
          </div>
        </div>
        <BoardTemplateGrid onPick={(id) => onNew(title.trim(), id)} />
        <input
          ref={pdfInput}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onNewFromPdf(title.trim() || file.name.replace(/\.pdf$/i, ""), file);
            e.target.value = "";
          }}
        />
        <input
          ref={importInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              onImport(await readBoardFile(file));
            } catch (err) {
              alert((err as Error).message);
            }
          }}
        />
      </main>

      <aside className="recent" aria-labelledby="recent-title">
        <h2 id="recent-title">Your boards</h2>
        {boards.length === 0 ? (
          <p className="muted small">Boards you create will show up here.</p>
        ) : (
          <ul className="board-list">
            {boards.map((b) => (
              <li key={b.id}>
                <button className="board-open" onClick={() => onOpen(b.id)}>
                  {b.frames[0]?.thumbnail ? (
                    <img src={b.frames[0].thumbnail} alt="" />
                  ) : (
                    <span className="board-thumb-empty" />
                  )}
                  <span className="board-text">
                    <span className="board-name">{b.title || "Untitled Brainstorm"}</span>
                    <span className="muted small">
                      {b.frames.length} frame{b.frames.length === 1 ? "" : "s"} · {edited(b.updated)}
                    </span>
                  </span>
                </button>
                <button
                  className="board-del"
                  title="Delete board"
                  aria-label={`Delete ${b.title || "Untitled Brainstorm"}`}
                  onClick={async () => {
                    if (!confirm(`Delete "${b.title || "Untitled"}" from this device?`)) return;
                    await deleteBoard(b.id);
                    void refresh();
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">Saved in this browser on this device.</p>
      </aside>
    </div>
  );
}

const edited = (t: number) =>
  new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
