import type { ExtractedMetadata } from "../types";
import { canvasToBlob, COVER_WIDTH } from "./cover";

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

/** Carga pdf.js una sola vez y configura su worker. */
export function loadPdfjs() {
  pdfjsPromise ??= import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    return pdfjs;
  });
  return pdfjsPromise;
}

interface PdfInfo {
  Title?: string;
  Author?: string;
}

export async function extractPdfMetadata(file: Blob): Promise<ExtractedMetadata> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;

  try {
    const { info } = await doc.getMetadata().catch(() => ({ info: {} }));
    const { Title, Author } = (info ?? {}) as PdfInfo;

    // La portada es la primera página renderizada a miniatura
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: COVER_WIDTH / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport }).promise;
    const cover = await canvasToBlob(canvas);

    return { title: Title, author: Author, cover };
  } finally {
    // En pdf.js 6 la liberación se hace sobre la tarea de carga
    await loadingTask.destroy();
  }
}
