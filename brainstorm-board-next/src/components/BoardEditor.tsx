import { useCallback, useEffect, useRef, useState } from "react";
import {
  CaptureUpdateAction,
  Excalidraw,
  FONT_FAMILY,
  MainMenu,
  getSceneVersion,
  newElementWith,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import { CLUSTERS, CLUSTER_W, buildCluster, nextClusterX, type ClusterKind } from "../board/clusters";
import { build, frameSize, isFrameFurniture, newPageFrame, pageRight, roleOf } from "../board/frame";
import { newId } from "../board/ids";
import { loadImage } from "../board/image";
import { downloadBoard } from "../board/io";
import { renderPdf } from "../board/pdf";
import { saveBoard, saveFile } from "../board/storage";
import { renderThumbnail } from "../board/thumbnail";
import type { Board, BoardFiles, Frame } from "../board/types";
import { frameFromTemplate } from "../templates/boardTemplates";

import { CLUSTER_MIME, ClusterPanel } from "./ClusterPanel";
import { FrameRail } from "./FrameRail";
import { FrameTemplateDialog } from "./TemplatePicker";

type Props = {
  initialBoard: Board;
  initialFiles: BoardFiles;
  /** PDF to import as soon as the editor is ready (from "Start from a PDF") */
  initialPdf?: File;
  onExit: () => void;
};

// Fixed margins (clear of the toolbar and zoom controls) so the frame sits in
// the same place whether or not the style panel is open.
const OFFSETS = { top: 76, bottom: 64, left: 16, right: 16 };

const isTall = (f: Frame) => f.height !== undefined;

export function BoardEditor({ initialBoard, initialFiles, initialPdf, onExit }: Props) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  // The board is kept in a ref (the editor reads and writes it outside React's
  // render cycle) and `rev` re-renders the chrome when it changes.
  const boardRef = useRef<Board>(initialBoard);
  const [, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);
  const [currentId, setCurrentId] = useState(initialBoard.frames[0].id);
  const currentIdRef = useRef(currentId);
  const filesRef = useRef<BoardFiles>({ ...initialFiles });
  const savedFiles = useRef(new Set(Object.keys(initialFiles)));
  const lastVersion = useRef<number>(-1);
  const saveTimer = useRef<number>(undefined);
  const [status, setStatus] = useState("");
  const [pickingFrame, setPickingFrame] = useState(false);
  const pdfInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const canvasWrap = useRef<HTMLDivElement>(null);

  const board = boardRef.current;
  const currentIndex = board.frames.findIndex((f) => f.id === currentId);
  const currentFrame = () => boardRef.current.frames.find((f) => f.id === currentIdRef.current)!;

  const flash = (msg: string) => {
    setStatus(msg);
    window.setTimeout(() => setStatus((s) => (s === msg ? "" : s)), 3000);
  };

  // ---------- Saving ----------

  /**
   * Copy what's on the canvas into the current frame. Skipped unless the
   * canvas is really showing that frame (its paper is there): while the editor
   * is starting up or being torn down the scene can be empty or stale, and
   * saving it then would wipe the frame.
   */
  const captureCurrent = useCallback(() => {
    if (!api) return;
    const frame = boardRef.current.frames.find((f) => f.id === currentIdRef.current);
    if (!frame) return;
    const scene = api.getSceneElements();
    const paperId = frame.elements.find((e) => roleOf(e) === "paper")?.id;
    const showingFrame = paperId ? scene.some((e) => e.id === paperId) : scene.length > 0;
    if (showingFrame) frame.elements = scene;
  }, [api]);

  const persist = useCallback(async () => {
    captureCurrent();
    const b = boardRef.current;
    b.updated = Date.now();
    const frame = b.frames.find((f) => f.id === currentIdRef.current);
    if (frame) frame.thumbnail = await renderThumbnail(frame.elements, filesRef.current);
    try {
      await saveBoard(b);
    } catch {
      flash("Could not save on this device. Use Export to keep a copy.");
    }
    bump();
  }, [captureCurrent]);

  const schedulePersist = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(persist, 600);
  }, [persist]);

  // Save on the way out, and if the tab is closed mid-edit.
  useEffect(() => {
    const flush = () => {
      window.clearTimeout(saveTimer.current);
      void persist();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [persist]);

  const storeNewFiles = (files: BinaryFiles) => {
    for (const file of Object.values(files)) {
      if (savedFiles.current.has(file.id)) continue;
      savedFiles.current.add(file.id);
      filesRef.current[file.id] = file;
      void saveFile(boardRef.current.id, file);
    }
  };

  const onChange = (elements: readonly ExcalidrawElement[], _: unknown, files: BinaryFiles) => {
    storeNewFiles(files);
    const version = getSceneVersion(elements);
    if (version === lastVersion.current) return;
    lastVersion.current = version;
    schedulePersist();
  };

  /** Add elements to the current frame as one undoable step */
  const addToFrame = (els: ExcalidrawElement[], select: ExcalidrawElement[] = els) => {
    if (!api) return;
    api.updateScene({
      elements: [...api.getSceneElementsIncludingDeleted(), ...els],
      appState: { selectedElementIds: Object.fromEntries(select.map((e) => [e.id, true])) },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  // ---------- Frames ----------

  // Lock the view to the current frame: no panning off the page and no
  // zooming out past it (zooming in for detail is fine). Standard frames fit
  // whole; tall frames (portrait PDF pages) fit the width and scroll down.
  const fitFrame = useCallback(() => {
    if (!api) return;
    const f = boardRef.current.frames.find((fr) => fr.id === currentIdRef.current);
    if (!f) return;
    const { width, height } = frameSize(f);
    // Drop the previous frame's lock so it doesn't clamp the new fit.
    api.updateScene({ appState: { scrollConstraints: null }, captureUpdate: CaptureUpdateAction.NEVER });
    if (!isTall(f)) {
      api.setViewport({
        target: { x: 0, y: 0, width, height },
        fit: "contain",
        lock: { scroll: true, zoom: true, overscroll: false },
        offsets: OFFSETS,
        animation: false,
      });
      return;
    }
    const s = api.getAppState();
    const vw = Math.max(1, s.width - OFFSETS.left - OFFSETS.right);
    const vh = Math.max(1, s.height - OFFSETS.top - OFFSETS.bottom);
    api.setViewport({
      target: { x: 0, y: 0, width, height: Math.min(height, (width * vh) / vw) },
      fit: "contain",
      offsets: OFFSETS,
      animation: false,
    });
    api.updateScene({
      appState: {
        scrollConstraints: {
          x: 0,
          y: 0,
          width,
          height,
          lockScroll: true,
          lockZoom: true,
          zoom: api.getAppState().zoom.value,
          overscroll: 0,
          offsets: OFFSETS,
        },
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, [api]);

  // Fit on load, and again when the window or panels change size.
  useEffect(() => {
    if (!api || !canvasWrap.current) return;
    const ro = new ResizeObserver(() => fitFrame());
    ro.observe(canvasWrap.current);
    return () => ro.disconnect();
  }, [api, fitFrame]);

  const showFrame = useCallback(
    (id: string) => {
      if (!api) return;
      const frame = boardRef.current.frames.find((f) => f.id === id);
      if (!frame) return;
      currentIdRef.current = id;
      setCurrentId(id);
      api.updateScene({
        elements: frame.elements,
        appState: { selectedElementIds: {}, editingTextElement: null },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      api.history.clear();
      lastVersion.current = getSceneVersion(api.getSceneElementsIncludingDeleted());
      fitFrame();
    },
    [api, fitFrame],
  );

  const switchTo = (id: string) => {
    if (id === currentIdRef.current) return;
    captureCurrent();
    void persist();
    showFrame(id);
  };

  const addFrame = (templateId: string) => {
    setPickingFrame(false);
    captureCurrent();
    const b = boardRef.current;
    const f = frameFromTemplate(templateId, `Frame ${b.frames.length + 1}`);
    b.frames.splice(b.frames.findIndex((fr) => fr.id === currentIdRef.current) + 1, 0, f);
    showFrame(f.id);
    void persist();
  };

  const deleteFrame = (id: string) => {
    captureCurrent();
    const b = boardRef.current;
    const i = b.frames.findIndex((f) => f.id === id);
    if (i < 0 || b.frames.length === 1) return;
    b.frames.splice(i, 1);
    if (id === currentIdRef.current) showFrame(b.frames[Math.max(0, i - 1)].id);
    void persist();
  };

  // `to` is the slot the frame lands before, counted before it is removed.
  const moveFrame = (from: number, to: number) => {
    if (to > from) to--;
    if (from === to) return;
    const frames = boardRef.current.frames;
    const [f] = frames.splice(from, 1);
    frames.splice(to, 0, f);
    void persist();
  };

  const clearFrame = () => {
    if (!api || !confirm("Clear everything you've added to this frame? PDF pages and template layouts stay.")) return;
    api.updateScene({
      elements: api
        .getSceneElementsIncludingDeleted()
        // newElementWith bumps each element's version so the change is saved
        // (and would merge correctly in a shared board).
        .map((e) => (isFrameFurniture(e) || e.isDeleted ? e : newElementWith(e, { isDeleted: true }))),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  // ---------- PDF import ----------

  const importPdf = useCallback(
    async (file: File) => {
      if (!api) return;
      captureCurrent();
      try {
        const pages = await renderPdf(file, (i, n) => setStatus(`Rendering page ${i} of ${n}...`));
        const name = file.name.replace(/\.pdf$/i, "");
        api.addFiles(pages.map((p) => p.file));
        storeNewFiles(Object.fromEntries(pages.map((p) => [p.file.id, p.file])));
        const b = boardRef.current;
        const newFrames = pages.map((p, i) =>
          newPageFrame(`${name} p${i + 1}`, p.file.id, p.width, p.height),
        );
        // A brand new board starting from a PDF replaces its empty first frame.
        const cur = currentFrame();
        const isEmpty = b.frames.length === 1 && cur.elements.every((e) => roleOf(e) === "paper");
        if (isEmpty) b.frames = newFrames;
        else b.frames.splice(b.frames.indexOf(cur) + 1, 0, ...newFrames);
        for (const f of newFrames) f.thumbnail = await renderThumbnail(f.elements, filesRef.current);
        showFrame(newFrames[0].id);
        await persist();
        flash(`Added ${pages.length} page${pages.length === 1 ? "" : "s"}`);
      } catch (err) {
        console.error(err);
        flash("Could not read that PDF.");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, captureCurrent, persist, showFrame],
  );

  const pdfStarted = useRef(false);
  useEffect(() => {
    if (api && initialPdf && !pdfStarted.current) {
      pdfStarted.current = true;
      void importPdf(initialPdf);
    }
  }, [api, initialPdf, importPdf]);

  // Thumbnails for frames that don't have one yet (e.g. imported boards).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const f of boardRef.current.frames) {
        if (cancelled) return;
        if (!f.thumbnail) f.thumbnail = await renderThumbnail(f.elements, filesRef.current);
      }
      if (!cancelled) bump();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- Images ----------

  const addImages = async (files: File[]) => {
    if (!api || !files.length) return;
    const { width: fw, height: fh } = frameSize(currentFrame());
    const left = pageRight(api.getSceneElements());
    const areaX = left;
    const areaW = fw - left;
    const added: ExcalidrawElement[] = [];
    try {
      for (const [i, file] of files.entries()) {
        const img = await loadImage(file);
        api.addFiles([img.file]);
        storeNewFiles({ [img.file.id]: img.file });
        // Fit within part of the open area, cascading when adding several.
        const scale = Math.min(1, (areaW * 0.5) / img.width, (fh * 0.6) / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = Math.min(fw - w, areaX + (areaW - w) / 2 + i * 32);
        const y = Math.min(fh - h, (fh - h) / 2 + i * 32);
        added.push(
          ...build([
            { type: "image", id: newId("im"), x, y, width: w, height: h, fileId: img.file.id, status: "saved" },
          ]),
        );
      }
    } catch (err) {
      console.error(err);
      flash("Could not read that image.");
    }
    if (added.length) addToFrame(added);
  };

  // ---------- Thought clusters ----------

  const addCluster = (kind: ClusterKind, atX?: number) => {
    if (!api) return;
    const { width: fw, height: fh } = frameSize(currentFrame());
    const els = api.getSceneElements();
    const x =
      atX !== undefined
        ? Math.max(0, Math.min(atX - CLUSTER_W / 2, fw - CLUSTER_W))
        : nextClusterX(els, pageRight(els), fw);
    addToFrame(buildCluster(kind, x, fh), []);
  };

  const onDropCapture = (e: React.DragEvent) => {
    const label = e.dataTransfer.getData(CLUSTER_MIME);
    const kind = CLUSTERS.find((k) => k.label === label);
    if (!kind || !api) return;
    e.preventDefault();
    e.stopPropagation();
    const at = viewportCoordsToSceneCoords(
      { clientX: e.clientX, clientY: e.clientY },
      api.getAppState(),
    );
    addCluster(kind, at.x);
  };

  // ---------- Render ----------

  const [initialData] = useState<ExcalidrawInitialDataState>(() => ({
    elements: initialBoard.frames[0].elements,
    files: initialFiles,
    appState: {
      viewBackgroundColor: "#eef0ee",
      currentItemRoughness: 0,
      currentItemFontFamily: FONT_FAMILY.Nunito,
      currentItemStrokeColor: "#1e1e1e",
    },
  }));

  return (
    <div className="app">
      <header className="topbar">
        <button className="link-btn" onClick={onExit} title="All boards">
          ← Boards
        </button>
        <input
          className="board-title"
          defaultValue={board.title}
          aria-label="Board title"
          onChange={(e) => {
            boardRef.current.title = e.target.value;
            schedulePersist();
          }}
        />
        <div className="frame-nav">
          <button
            disabled={currentIndex <= 0}
            onClick={() => switchTo(board.frames[currentIndex - 1].id)}
            aria-label="Previous frame"
          >
            ‹
          </button>
          <span>
            {currentIndex + 1} / {board.frames.length}
          </span>
          <button
            disabled={currentIndex >= board.frames.length - 1}
            onClick={() => switchTo(board.frames[currentIndex + 1].id)}
            aria-label="Next frame"
          >
            ›
          </button>
        </div>
        <span className="status" role="status">
          {status}
        </span>
        <div className="topbar-actions">
          <button className="btn" onClick={() => imageInput.current?.click()}>
            Add image
          </button>
          <button className="btn" onClick={() => pdfInput.current?.click()}>
            Upload PDF
          </button>
          <button className="btn" onClick={clearFrame}>
            Clear frame
          </button>
          <button
            className="btn"
            onClick={() => {
              captureCurrent();
              downloadBoard(boardRef.current, filesRef.current);
            }}
          >
            Export
          </button>
        </div>
        <input
          ref={pdfInput}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importPdf(file);
            e.target.value = "";
          }}
        />
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void addImages(files);
          }}
        />
      </header>
      <div className="main">
        <FrameRail
          frames={board.frames}
          currentId={currentId}
          onSelect={switchTo}
          onAdd={() => setPickingFrame(true)}
          onDelete={deleteFrame}
          onMove={moveFrame}
        />
        <div className="canvas-wrap" ref={canvasWrap} onDropCapture={onDropCapture}>
          <Excalidraw
            onExcalidrawAPI={setApi}
            initialData={initialData}
            onChange={onChange}
            name={board.title}
            UIOptions={{
              canvasActions: {
                changeViewBackgroundColor: false,
                clearCanvas: false,
                export: false,
                loadScene: false,
                saveToActiveFile: false,
                toggleTheme: false,
                saveAsImage: true,
              },
            }}
          >
            <MainMenu>
              <MainMenu.DefaultItems.SaveAsImage />
              <MainMenu.DefaultItems.Help />
            </MainMenu>
          </Excalidraw>
        </div>
        <ClusterPanel onAdd={(k) => addCluster(k)} />
      </div>
      {pickingFrame && (
        <FrameTemplateDialog onPick={addFrame} onClose={() => setPickingFrame(false)} />
      )}
    </div>
  );
}
