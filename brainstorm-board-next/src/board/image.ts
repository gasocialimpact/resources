import type { BinaryFileData, DataURL } from "@excalidraw/excalidraw/types";
import type { FileId } from "@excalidraw/excalidraw/element/types";

import { newId } from "./ids";

// Largest edge kept for uploaded images. Big phone photos are scaled down so
// boards stay quick to load and save.
const MAX_PX = 2400;

export type LoadedImage = { file: BinaryFileData; width: number; height: number };

export async function loadImage(file: File): Promise<LoadedImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_PX / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  let dataURL: string;
  let mimeType: BinaryFileData["mimeType"];
  if (scale === 1 && file.size < 2_000_000 && /^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(file.type)) {
    dataURL = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    mimeType = file.type as BinaryFileData["mimeType"];
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
    // Keep transparency for PNGs; photos compress better as JPEG.
    mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
    dataURL = canvas.toDataURL(mimeType, 0.9);
  }
  bitmap.close();
  return {
    file: { id: newId("img") as FileId, mimeType, dataURL: dataURL as DataURL, created: Date.now() },
    width,
    height,
  };
}
