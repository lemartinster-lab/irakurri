import type { ExtractedMetadata } from "../types";
import { resizeImage } from "./cover";

export async function extractEpubMetadata(file: Blob): Promise<ExtractedMetadata> {
  const { default: ePub } = await import("epubjs");
  const book = ePub(await file.arrayBuffer());

  try {
    // Esperar a que epub.js termine TODA la carga interna (índice, opciones…):
    // si se destruye antes, sus promesas pendientes fallan con errores en consola.
    await book.ready;
    const metadata = await book.loaded.metadata;
    let cover: Blob | undefined;

    const coverUrl = await book.coverUrl();
    if (coverUrl) {
      const original = await fetch(coverUrl).then((r) => r.blob());
      cover = await resizeImage(original).catch(() => original);
    }

    return { title: metadata.title, author: metadata.creator, cover };
  } finally {
    book.destroy();
  }
}
