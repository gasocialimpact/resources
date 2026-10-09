# Brainstorm Board (next)

Prototype of the next Brainstorm Board: Jamboard-style fixed frames with
[Excalidraw](https://github.com/excalidraw/excalidraw) (MIT) as the drawing
engine inside each frame. The current single-file version lives in
`../brainstorm-board/` and is unchanged.

## How it works

- Each frame is a fixed 16:9 page. The view is locked to the page with
  Excalidraw's viewport lock, so there is no infinite canvas. You can zoom in
  for detail but not pan off the page or zoom out past it.
- Excalidraw supplies the tools: select and move, pen, shapes, arrows, text,
  sticky notes, eraser, images, undo and redo.
- The frame rail on the left switches frames. Drag a thumbnail to reorder.
  The + button adds a frame from a template.
- New boards start from a board template (a set of frames) and new frames from
  a frame template (SWOT, theory of change, action plan, and so on). Template
  shapes are locked so they stay put; their text stays editable. Templates are
  defined in `src/templates/`.
- Upload PDF turns each page into a frame with the page as a locked, high
  resolution image on the left and open whiteboard on the right. Portrait
  pages get a taller frame that fits the window's width and scrolls top to
  bottom, so the text is readable.
- Add image places pictures on the current frame. Pasting or dropping images
  onto the canvas works too.
- Thought clusters (right panel) add a top-to-bottom section to the frame: a
  colored prompt header, a tinted column, and starter notes. Each cluster is an
  Excalidraw frame element, so notes inside move with it; drag a cluster by its
  name.
- Boards are saved in the browser's IndexedDB on this device. Export saves a
  `.brainstorm.json` file (images included) that Open a file loads back.

## Develop

```bash
npm install
npm run dev
```

`npm run build` writes a static site to `dist/`. Fonts are copied from the
Excalidraw package into `public/fonts` so they load from this site rather than
a CDN.

## Notes

- Excalidraw is pinned to the nightly build `0.18.0-143b5b6`. The viewport
  lock and sticky notes are not in a stable release yet (latest stable is
  0.18.1). Upgrade deliberately and retest frame locking when moving off it.
- Multi-user editing is not built yet. Excalidraw elements already carry
  `version` / `versionNonce` and the package exports `reconcileElements`, which
  is the merge step a live sync service would use.
