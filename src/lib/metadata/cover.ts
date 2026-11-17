/** Anchura de las miniaturas de portada: suficiente para la cuadrícula en pantallas densas. */
export const COVER_WIDTH = 360;

export function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.8): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? undefined), "image/jpeg", quality);
  });
}

/** Reduce una imagen (por ejemplo la portada de un EPUB) a miniatura JPEG. */
export async function resizeImage(source: Blob, width = COVER_WIDTH): Promise<Blob | undefined> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, width / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvasToBlob(canvas);
}
