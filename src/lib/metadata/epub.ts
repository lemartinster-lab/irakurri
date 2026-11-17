import type { ExtractedMetadata } from "../types";
import { resizeImage } from "./cover";

export async function extractEpubMetadata(file: Blob): Promise<ExtractedMetadata> {
  const { default: ePub } = await import("epubjs");
  const book = ePub(await file.arrayBuffer());

  try {
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
