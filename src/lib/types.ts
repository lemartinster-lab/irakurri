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
  /** EPUB: mapa de posiciones calculado una vez (es lento) y reutilizado al reabrir */
  epubLocations?: string;
}

export type HighlightColor = "amarillo" | "verde" | "azul" | "rosa";

/** Rectángulo en fracciones de la página (0–1): independiente del zoom. */
export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Annotation {
  id: string;
  bookId: string;
  kind: "bookmark" | "highlight";
  /** PDF: número de página. EPUB: CFI (marcador) o rango CFI (subrayado). */
  location: string;
  /** Posición relativa en el libro (0–1) para ordenar la lista */
  order: number;
  /** Texto subrayado, o descripción del lugar en los marcadores */
  text: string;
  note?: string;
  color?: HighlightColor;
  /** PDF: zonas subrayadas en la página */
  rects?: NormRect[];
  createdAt: number;
}

export interface ExtractedMetadata {
  title?: string;
  author?: string;
  cover?: Blob;
}
