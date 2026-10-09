import { useCallback, useEffect, useRef, useState } from "react";
import {
  CaptureUpdateAction,
  Excalidraw,
  FONT_FAMILY,
  MainMenu,
  getSceneVersion,
  newElementWith,
  reconcileElements,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type {
  BinaryFiles,
  Collaborator,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  SocketId,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import { CLUSTERS, CLUSTER_W, buildCluster, nextClusterX, type ClusterKind } from "../board/clusters";
import { build, frameSize, isFrameFurniture, newPageFrame, pageRight, roleOf } from "../board/frame";
import { newId } from "../board/ids";
import { loadImage } from "../board/image";
import { downloadBoard } from "../board/io";
import { renderPdf } from "../board/pdf";
import { deleteBoard, saveBoard, saveFile } from "../board/storage";
import { renderThumbnail } from "../board/thumbnail";
import type { Board, BoardFiles, Frame } from "../board/types";
import { supabase } from "../sync/client";
import { newShareId } from "../sync/ids";
import { LiveSession, type LiveStatus, type Peer, type PointerMsg } from "../sync/live";
import { isNewer, mergeElements } from "../sync/merge";
import {
  downloadFile,
  fetchBoard,
  frameMeta,
  setTitle as saveRemoteTitle,
  upsertElements,
  upsertFrames,
  uploadBoard,
  uploadFile,
  type ElementRow,
  type FrameMeta,
} from "../sync/remote";
import { frameFromTemplate } from "../templates/boardTemplates";

import { CLUSTER_MIME, ClusterPanel } from "./ClusterPanel";
import { FrameRail } from "./FrameRail";
import { NameDialog, getSavedName } from "./NameDialog";
import { FrameTemplateDialog } from "./TemplatePicker";

type Props = {
  initialBoard: Board;
  initialFiles: BoardFiles;
  /** PDF to import as soon as the editor is ready (from "Start from a PDF") */
  initialPdf?: File;
  onExit: () => void;
  /** Called when a device-only board becomes shared (it gets a new id) */
  onShared: (id: string) => void;
};

// Fixed margins (clear of the toolbar and zoom controls) so the frame sits in
// the same place whether or not the style panel is open.
const OFFSETS = { top: 76, bottom: 64, left: 16, right: 16 };

const isTall = (f: Frame) => f.height !== undefined;

/** A sort key between two neighbors' positions */
const between = (prev?: number, next?: number) =>
  prev === undefined && next === undefined
    ? 0
    : prev === undefined
      ? next! - 1
      : next === undefined
        ? prev + 1
        : (prev + next) / 2;

export const shareLink = (id: string) =>
  `${window.location.origin}${window.location.pathname}#b=${id}`;

export function BoardEditor({ initialBoard, initialFiles, initialPdf, onExit, onShared }: Props) {
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
  const [title, setTitleState] = useState(initialBoard.title);
  const [status, setStatus] = useState("");
  const [pickingFrame, setPickingFrame] = useState(false);
  const pdfInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const canvasWrap = useRef<HTMLDivElement>(null);

  // Frames sort by position; older boards may not have one yet.
  boardRef.current.frames.forEach((f, i) => (f.position ??= i));

  const board = boardRef.current;
  const currentIndex = board.frames.findIndex((f) => f.id === currentId);
  const currentFrame = () => boardRef.current.frames.find((f) => f.id === currentIdRef.current)!;
  const frameById = (id: string) => boardRef.current.frames.find((f) => f.id === id);

  const flash = (msg: string, ms = 3000) => {
    setStatus(msg);
    window.setTimeout(() => setStatus((s) => (s === msg ? "" : s)), ms);
  };

  // ---------- Live sharing state ----------

  const [shared, setShared] = useState(!!initialBoard.shared && !!supabase);
  const [name, setName] = useState(getSavedName);
  const liveRef = useRef<LiveSession | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const peersRef = useRef<Peer[]>([]);
  const pointers = useRef(new Map<string, PointerMsg>());
  /** Last version of each element that we've sent or received */
  const known = useRef(new Map<string, number>());
  const outbox = useRef(new Map<string, { frameId: string; element: ExcalidrawElement }>());
  const unsaved = useRef(new Map<string, ElementRow>());
  const unsavedFrames = useRef(new Map<string, FrameMeta>());
  const sendTimer = useRef<number>(undefined);
  const remoteSaveTimer = useRef<number>(undefined);
  /** Elements that arrived for a frame we haven't heard about yet */
  const orphans = useRef(new Map<string, ExcalidrawElement[]>());

  const rememberAll = () => {
    for (const f of boardRef.current.frames) for (const e of f.elements) known.current.set(e.id, e.version);
  };
  const rememberedOnce = useRef(false);
  if (!rememberedOnce.current) {
    rememberedOnce.current = true;
    rememberAll();
  }

  // ---------- Saving on this device ----------

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
    const scene = api.getSceneElementsIncludingDeleted();
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

  // ---------- Saving online and sending to others ----------

  const flushOutbox = () => {
    const live = liveRef.current;
    if (!live || !outbox.current.size) return;
    const byFrame = new Map<string, ExcalidrawElement[]>();
    for (const { frameId, element } of outbox.current.values()) {
      byFrame.set(frameId, [...(byFrame.get(frameId) ?? []), element]);
    }
    outbox.current.clear();
    for (const [frameId, els] of byFrame) live.sendElements(frameId, els);
  };

  const flushRemoteSave = async () => {
    const b = boardRef.current;
    if (!b.shared) return;
    const rows = [...unsaved.current.values()];
    const frames = [...unsavedFrames.current.values()];
    unsaved.current.clear();
    unsavedFrames.current.clear();
    try {
      // Frames first, so their elements are never orphaned in the database.
      await upsertFrames(b.id, frames);
      await upsertElements(b.id, rows);
    } catch (err) {
      console.error(err);
      // Put them back (unless something newer is already queued) and retry.
      for (const r of rows) {
        const q = unsaved.current.get(r.element.id);
        if (!q || isNewer(r.element, q.element)) unsaved.current.set(r.element.id, r);
      }
      for (const f of frames) if (!unsavedFrames.current.has(f.id)) unsavedFrames.current.set(f.id, f);
      flash("Not saved online yet. Retrying...", 4000);
      window.clearTimeout(remoteSaveTimer.current);
      remoteSaveTimer.current = window.setTimeout(flushRemoteSave, 5000);
    }
  };

  const scheduleRemote = () => {
    window.clearTimeout(sendTimer.current);
    sendTimer.current = window.setTimeout(flushOutbox, 50);
    window.clearTimeout(remoteSaveTimer.current);
    remoteSaveTimer.current = window.setTimeout(flushRemoteSave, 800);
  };

  /** Queue any elements of a frame that changed since we last synced them. */
  const publishElements = (frameId: string, elements: readonly ExcalidrawElement[]) => {
    if (!boardRef.current.shared) return;
    let any = false;
    for (const e of elements) {
      if (known.current.get(e.id) === e.version) continue;
      known.current.set(e.id, e.version);
      outbox.current.set(e.id, { frameId, element: e });
      unsaved.current.set(e.id, { frame_id: frameId, element: e });
      any = true;
    }
    if (any) scheduleRemote();
  };

  /** Share frame additions, moves, renames and deletions. */
  const publishFrames = (frames: Frame[], deleted: Frame[] = []) => {
    if (!boardRef.current.shared) return;
    const metas = frames.map((f) => frameMeta(f));
    const gone = deleted.map((f) => frameMeta(f, true));
    for (const m of [...metas, ...gone]) unsavedFrames.current.set(m.id, m);
    liveRef.current?.sendFrames(metas, deleted.map((f) => f.id));
    for (const f of frames) publishElements(f.id, f.elements);
    scheduleRemote();
  };

  // Save on the way out, and if the tab is closed mid-edit.
  useEffect(() => {
    const flush = () => {
      window.clearTimeout(saveTimer.current);
      void persist();
      flushOutbox();
      if (unsaved.current.size || unsavedFrames.current.size) void flushRemoteSave();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist]);

  // ---------- Images ----------

  const storeNewFiles = (files: BinaryFiles) => {
    for (const file of Object.values(files)) {
      if (savedFiles.current.has(file.id)) continue;
      savedFiles.current.add(file.id);
      filesRef.current[file.id] = file;
      void saveFile(boardRef.current.id, file);
      if (boardRef.current.shared) {
        uploadFile(boardRef.current.id, file).catch((err) => {
          console.error(err);
          flash("An image didn't upload, so others may not see it.", 5000);
        });
      }
    }
  };

  /**
   * Fetch any images these elements need that we don't have yet. An image can
   * arrive before its upload has finished, so failed downloads retry with
   * growing waits.
   */
  const fetching = useRef(new Set<string>());
  const ensureFiles = useCallback(
    (elements: readonly ExcalidrawElement[]) => {
      if (!boardRef.current.shared) return;
      const missing = elements.filter(
        (e): e is Extract<ExcalidrawElement, { type: "image" }> =>
          e.type === "image" && !!e.fileId && !filesRef.current[e.fileId] && !fetching.current.has(e.fileId),
      );
      const attempt = (fileId: string, tries: number): Promise<BinaryFiles[string]> =>
        downloadFile(boardRef.current.id, fileId).catch((err) => {
          if (tries >= 6) throw err;
          return new Promise((r) => window.setTimeout(r, 1000 * 2 ** tries)).then(() => attempt(fileId, tries + 1));
        });
      for (const e of missing) {
        const fileId = e.fileId!;
        fetching.current.add(fileId);
        attempt(fileId, 0)
          .then((file) => {
            filesRef.current[fileId] = file;
            savedFiles.current.add(fileId);
            void saveFile(boardRef.current.id, file);
            api?.addFiles([file]);
            for (const f of boardRef.current.frames) {
              if (f.elements.some((x) => x.type === "image" && x.fileId === fileId)) scheduleThumb(f.id);
            }
          })
          .catch((err) => console.error(err))
          .finally(() => fetching.current.delete(fileId));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api],
  );

  // ---------- Thumbnails for frames changed by others ----------

  const thumbTimers = useRef(new Map<string, number>());
  const scheduleThumb = (frameId: string) => {
    window.clearTimeout(thumbTimers.current.get(frameId));
    thumbTimers.current.set(
      frameId,
      window.setTimeout(async () => {
        const f = frameById(frameId);
        if (!f) return;
        f.thumbnail = await renderThumbnail(f.elements, filesRef.current);
        bump();
      }, 800),
    );
  };

  // ---------- Canvas changes ----------

  const onChange = (elements: readonly ExcalidrawElement[], _: unknown, files: BinaryFiles) => {
    storeNewFiles(files);
    const version = getSceneVersion(elements);
    if (version === lastVersion.current) return;
    lastVersion.current = version;
    schedulePersist();
    if (api && boardRef.current.shared) {
      const frame = currentFrame();
      const scene = api.getSceneElementsIncludingDeleted();
      const paperId = frame?.elements.find((e) => roleOf(e) === "paper")?.id;
      if (frame && (!paperId || scene.some((e) => e.id === paperId))) publishElements(frame.id, scene);
    }
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
      liveRef.current?.setFrame(id);
      refreshCollaborators();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, fitFrame],
  );

  const switchTo = (id: string) => {
    if (id === currentIdRef.current) return;
    captureCurrent();
    void persist();
    showFrame(id);
  };

  const sortFrames = () => boardRef.current.frames.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const addFrame = (templateId: string) => {
    setPickingFrame(false);
    captureCurrent();
    const b = boardRef.current;
    const i = b.frames.findIndex((fr) => fr.id === currentIdRef.current);
    const f = frameFromTemplate(templateId, `Frame ${b.frames.length + 1}`);
    f.position = between(b.frames[i]?.position, b.frames[i + 1]?.position);
    b.frames.splice(i + 1, 0, f);
    publishFrames([f]);
    showFrame(f.id);
    void persist();
  };

  const deleteFrame = (id: string) => {
    captureCurrent();
    const b = boardRef.current;
    const i = b.frames.findIndex((f) => f.id === id);
    if (i < 0 || b.frames.length === 1) return;
    const [gone] = b.frames.splice(i, 1);
    publishFrames([], [gone]);
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
    f.position = between(frames[to - 1]?.position, frames[to + 1]?.position);
    publishFrames([f]);
    void persist();
  };

  const clearFrame = () => {
    if (!api || !confirm("Clear everything you've added to this frame? PDF pages and template layouts stay.")) return;
    api.updateScene({
      elements: api
        .getSceneElementsIncludingDeleted()
        // newElementWith bumps each element's version so the change is saved
        // and wins over older copies on other people's screens.
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
        const at = b.frames.indexOf(cur);
        const lo = isEmpty ? undefined : cur.position;
        const hi = b.frames[at + 1]?.position;
        newFrames.forEach((f, i) => {
          f.position =
            lo === undefined && hi === undefined
              ? i
              : lo === undefined
                ? hi! - newFrames.length + i
                : hi === undefined
                  ? lo + 1 + i
                  : lo + ((hi - lo) * (i + 1)) / (newFrames.length + 1);
        });
        if (isEmpty) b.frames = newFrames;
        else b.frames.splice(at + 1, 0, ...newFrames);
        publishFrames(newFrames, isEmpty ? [cur] : []);
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

  // Frames need distinct positions to sort the same way for everyone. Boards
  // saved before positions were assigned get renumbered once.
  useEffect(() => {
    if (!api) return;
    const frames = boardRef.current.frames;
    if (new Set(frames.map((f) => f.position)).size === frames.length) return;
    frames.forEach((f, i) => (f.position = i));
    publishFrames(frames);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  // Shared boards may reference images this device hasn't downloaded yet.
  useEffect(() => {
    if (api && shared) ensureFiles(boardRef.current.frames.flatMap((f) => f.elements));
  }, [api, shared, ensureFiles]);

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

  // ---------- Live: receiving ----------

  /** Show other people's cursors, for those on the same frame. */
  const refreshCollaborators = () => {
    if (!api) return;
    const here = currentIdRef.current;
    const map = new Map<SocketId, Collaborator>();
    for (const p of peersRef.current) {
      if (p.frameId !== here) continue;
      const ptr = pointers.current.get(p.key);
      map.set(p.key as SocketId, {
        id: p.key,
        socketId: p.key as SocketId,
        username: p.name,
        color: { background: p.color, stroke: p.color },
        ...(ptr && ptr.frameId === here
          ? { pointer: { x: ptr.x, y: ptr.y, tool: ptr.tool }, button: ptr.button }
          : {}),
      });
    }
    api.updateScene({ collaborators: map });
  };

  const applyRemoteElements = (frameId: string, elements: ExcalidrawElement[]) => {
    for (const e of elements) {
      const v = known.current.get(e.id);
      if (v === undefined || e.version >= v) known.current.set(e.id, e.version);
    }
    const frame = frameById(frameId);
    if (!frame) {
      orphans.current.set(frameId, mergeElements(orphans.current.get(frameId) ?? [], elements));
      return;
    }
    if (frameId === currentIdRef.current && api) {
      const merged = reconcileElements(
        api.getSceneElementsIncludingDeleted(),
        elements as unknown as Parameters<typeof reconcileElements>[1],
        api.getAppState(),
      );
      api.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER });
      frame.elements = merged;
    } else {
      frame.elements = mergeElements(frame.elements, elements);
    }
    ensureFiles(elements);
    scheduleThumb(frameId);
    schedulePersist();
  };

  const applyRemoteFrames = (upserted: FrameMeta[], deleted: string[]) => {
    const b = boardRef.current;
    for (const m of upserted) {
      const f = frameById(m.id);
      if (f) {
        f.position = m.position;
        f.title = m.title;
        f.width = m.width ?? undefined;
        f.height = m.height ?? undefined;
      } else if (!deleted.includes(m.id)) {
        const els = orphans.current.get(m.id) ?? [];
        orphans.current.delete(m.id);
        b.frames.push({
          id: m.id,
          title: m.title,
          position: m.position,
          width: m.width ?? undefined,
          height: m.height ?? undefined,
          elements: els,
        });
        scheduleThumb(m.id);
      }
    }
    const wasCurrent = currentIdRef.current;
    const idx = b.frames.findIndex((f) => f.id === wasCurrent);
    if (deleted.length) b.frames = b.frames.filter((f) => !deleted.includes(f.id));
    sortFrames();
    if (deleted.includes(wasCurrent) && b.frames.length) {
      showFrame(b.frames[Math.max(0, Math.min(idx, b.frames.length) - 1)].id);
      flash("That frame was removed by someone else.");
    }
    schedulePersist();
    bump();
  };

  /** After a dropped connection, pull the latest from the database. */
  const resync = async () => {
    try {
      const fresh = await fetchBoard(boardRef.current.id);
      if (!fresh) return;
      const deleted = boardRef.current.frames.filter((f) => !fresh.frames.some((x) => x.id === f.id)).map((f) => f.id);
      applyRemoteFrames(
        fresh.frames.map((f) => frameMeta(f)),
        deleted.filter((id) => !unsavedFrames.current.has(id)),
      );
      for (const f of fresh.frames) applyRemoteElements(f.id, [...f.elements]);
    } catch (err) {
      console.error(err);
    }
  };

  // Connect to the board's live channel while it's shared.
  const handlers = useRef({ applyRemoteElements, applyRemoteFrames, refreshCollaborators, resync });
  handlers.current = { applyRemoteElements, applyRemoteFrames, refreshCollaborators, resync };
  useEffect(() => {
    if (!api || !shared || !name || !supabase) return;
    const live = new LiveSession(boardRef.current.id, name, currentIdRef.current, {
      onElements: (frameId, els) => handlers.current.applyRemoteElements(frameId, els),
      onFrames: (up, del) => handlers.current.applyRemoteFrames(up, del),
      onTitle: (t) => {
        boardRef.current.title = t;
        setTitleState(t);
      },
      onPeers: (p) => {
        peersRef.current = p;
        setPeers(p);
        handlers.current.refreshCollaborators();
      },
      onPointer: (p) => {
        pointers.current.set(p.key, p);
        handlers.current.refreshCollaborators();
      },
      onStatus: setLiveStatus,
      onReconnect: () => void handlers.current.resync(),
    });
    liveRef.current = live;
    return () => {
      live.close();
      liveRef.current = null;
      setLiveStatus(null);
    };
  }, [api, shared, name]);

  const lastPointer = useRef(0);
  const onPointerUpdate = (p: { pointer: { x: number; y: number; tool: "pointer" | "laser" }; button: "up" | "down" }) => {
    const live = liveRef.current;
    const now = performance.now();
    if (!live || now - lastPointer.current < 50) return;
    lastPointer.current = now;
    live.sendPointer({ frameId: currentIdRef.current, ...p.pointer, button: p.button });
  };

  // ---------- Sharing ----------

  const [sharing, setSharing] = useState(false);
  const copyLink = async () => {
    const link = shareLink(boardRef.current.id);
    try {
      await navigator.clipboard.writeText(link);
      flash("Link copied. Anyone with the link can view and edit this board.", 5000);
    } catch {
      setStatus("");
      prompt("Copy this link to share the board:", link);
    }
  };

  const share = async () => {
    if (!supabase) return;
    if (boardRef.current.shared) return copyLink();
    setSharing(true);
    setStatus("Uploading board...");
    try {
      captureCurrent();
      const b = boardRef.current;
      const oldId = b.id;
      const id = newShareId();
      await uploadBoard({ ...b, id }, filesRef.current);
      b.id = id;
      b.shared = true;
      await saveBoard(b);
      await Promise.all(Object.values(filesRef.current).map((f) => saveFile(id, f)));
      await deleteBoard(oldId);
      rememberAll();
      setShared(true);
      onShared(id);
      await copyLink();
    } catch (err) {
      console.error(err);
      flash("Couldn't share this board. Check your connection and try again.", 5000);
    } finally {
      setSharing(false);
    }
  };

  const renameBoard = (t: string) => {
    setTitleState(t);
    boardRef.current.title = t;
    schedulePersist();
    if (boardRef.current.shared) {
      liveRef.current?.sendTitle(t);
      window.clearTimeout(titleTimer.current);
      titleTimer.current = window.setTimeout(() => {
        saveRemoteTitle(boardRef.current.id, boardRef.current.title).catch(console.error);
      }, 800);
    }
  };
  const titleTimer = useRef<number>(undefined);

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

  const frameNumber = (id: string) => board.frames.findIndex((f) => f.id === id) + 1;

  return (
    <div className="app">
      <header className="topbar">
        <button className="link-btn" onClick={onExit} title="All boards">
          ← Boards
        </button>
        <input
          className="board-title"
          value={title}
          aria-label="Board title"
          onChange={(e) => renameBoard(e.target.value)}
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
        {shared && (
          <div className="presence" aria-label="People on this board">
            {liveStatus && liveStatus !== "live" && (
              <span className={"live-dot " + liveStatus}>{liveStatus === "offline" ? "Offline" : "Connecting"}</span>
            )}
            {peers.map((p) => (
              <button
                key={p.key}
                className="avatar"
                style={{ background: p.color }}
                title={`${p.name}, on frame ${frameNumber(p.frameId) || "?"}. Click to go there.`}
                onClick={() => frameById(p.frameId) && switchTo(p.frameId)}
              >
                {p.name.trim().slice(0, 1).toUpperCase() || "?"}
              </button>
            ))}
          </div>
        )}
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
          {supabase && (
            <button className="btn btn-primary" onClick={share} disabled={sharing}>
              {shared ? "Copy link" : "Share"}
            </button>
          )}
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
          peers={peers}
        />
        <div className="canvas-wrap" ref={canvasWrap} onDropCapture={onDropCapture}>
          <Excalidraw
            onExcalidrawAPI={setApi}
            initialData={initialData}
            onChange={onChange}
            onPointerUpdate={onPointerUpdate}
            isCollaborating={shared}
            name={title}
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
      {shared && !name && <NameDialog onDone={setName} />}
    </div>
  );
}
