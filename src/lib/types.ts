export type BookFormat = "pdf" | "epub";

export interface Book {
  /** Identificador único (UUID) */
  id: string;
  title: string;
  author: string;
  format: BookFormat;
  /** Archivo original del libro */
  file: Blob;
  /** Portada en miniatura (si se pudo extraer) */
  cover?: Blob;
  /** Tamaño del archivo en bytes */
  size: number;
  addedAt: number;
  lastOpenedAt?: number;
  /** Progreso de lectura entre 0 y 1 */
  progress: number;
  /** Posición guardada: número de página (PDF) o CFI (EPUB) */
  location?: string;
}

export interface ExtractedMetadata {
  title?: string;
  author?: string;
  cover?: Blob;
}
