/**
 * Lógica pura de navegación y zoom del lector de PDF.
 * Separada del componente para poder probarla sin navegador.
 */

/** Niveles de zoom relativos al "ajustar a la anchura" (1 = ancho de pantalla). */
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;
export const DEFAULT_ZOOM = 1;

export function clampPage(page: number, total: number): number {
  if (!Number.isFinite(page) || total < 1) return 1;
  return Math.min(total, Math.max(1, Math.round(page)));
}

/** Progreso de lectura: la última página cuenta como libro terminado. */
export function pageProgress(page: number, total: number): number {
  if (total < 1) return 0;
  return clampPage(page, total) / total;
}

/** Recupera la página guardada; si no hay o no es válida, empieza en la 1. */
export function pageFromLocation(location: string | undefined, total: number): number {
  const parsed = Number.parseInt(location ?? "", 10);
  return Number.isNaN(parsed) ? 1 : clampPage(parsed, total);
}

/**
 * Escala con la que pdf.js debe dibujar la página para que, con zoom 1,
 * ocupe exactamente el ancho disponible (sin pasar de un máximo legible en escritorio).
 */
export function fitScale(containerWidth: number, pageWidth: number, maxWidth = 900): number {
  if (containerWidth <= 0 || pageWidth <= 0) return 1;
  return Math.min(containerWidth, maxWidth) / pageWidth;
}

export function zoomIn(current: number): number {
  return ZOOM_STEPS.find((z) => z > current + 1e-6) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
}

export function zoomOut(current: number): number {
  return [...ZOOM_STEPS].reverse().find((z) => z < current - 1e-6) ?? ZOOM_STEPS[0];
}

/**
 * Interpreta un gesto táctil. Solo cuenta como paso de página si es
 * claramente horizontal, para no confundirlo con el desplazamiento vertical.
 */
export function detectSwipe(dx: number, dy: number, threshold = 50): "next" | "prev" | null {
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? "next" : "prev";
}
