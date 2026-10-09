import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { BinaryFileData, DataURL } from "@excalidraw/excalidraw/types";
import type { FileId } from "@excalidraw/excalidraw/element/types";

import { newId } from "./ids";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// Long edge of each rendered page image. High enough that text stays sharp
// when a page fills a large or high-density screen.
const RENDER_PX = 2800;

export type PdfPage = { file: BinaryFileData; width: number; height: number };

export async function renderPdf(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<PdfPage[]> {
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: PdfPage[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.(i, pdf.numPages);
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(RENDER_PX / Math.max(base.width, base.height), 6);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // "print" renders in one pass instead of pacing itself with
    // requestAnimationFrame, so imports keep going in a background tab.
    await page.render({ canvasContext: ctx, viewport, intent: "print" }).promise;
    const dataURL = canvas.toDataURL("image/jpeg", 0.92) as DataURL;
    canvas.width = canvas.height = 0;
    pages.push({
      file: {
        id: newId("pdf") as FileId,
        mimeType: "image/jpeg",
        dataURL,
        created: Date.now(),
      },
      width: base.width,
      height: base.height,
    });
  }
  await pdf.destroy();
  return pages;
}
