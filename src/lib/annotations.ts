import { db as defaultDb, type IrakurriDB } from "./db";
import type { Annotation, HighlightColor, NormRect } from "./types";

export const HIGHLIGHT_COLORS: Record<HighlightColor, { label: string; fill: string }> = {
  amarillo: { label: "Amarillo", fill: "#facc15" },
  verde: { label: "Verde", fill: "#4ade80" },
  azul: { label: "Azul", fill: "#60a5fa" },
  rosa: { label: "Rosa", fill: "#f472b6" },
};
export const DEFAULT_COLOR: HighlightColor = "amarillo";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type NewAnnotation = Omit<Annotation, "id" | "createdAt">;

export async function addAnnotation(data: NewAnnotation, database: IrakurriDB = defaultDb): Promise<Annotation> {
  const annotation: Annotation = { ...data, id: newId(), createdAt: Date.now() };
  await database.annotations.add(annotation);
  return annotation;
}

export async function updateAnnotation(
  id: string,
  patch: Partial<Pick<Annotation, "note" | "color">>,
  database: IrakurriDB = defaultDb,
): Promise<void> {
  const clean = { ...patch };
  if (clean.note !== undefined) clean.note = clean.note.trim() || undefined;
  await database.annotations.update(id, clean);
}

export async function deleteAnnotation(id: string, database: IrakurriDB = defaultDb): Promise<void> {
  await database.annotations.delete(id);
}

/** Orden de lectura; a igual posición, el más antiguo primero. */
export function sortAnnotations(list: Annotation[]): Annotation[] {
  return [...list].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export async function listAnnotations(bookId: string, database: IrakurriDB = defaultDb): Promise<Annotation[]> {
  return sortAnnotations(await database.annotations.where("bookId").equals(bookId).toArray());
}

/**
 * Pone o quita un marcador. `matches` decide si un marcador existente
 * corresponde a la posición actual (misma página en PDF, misma pantalla en EPUB).
 * Devuelve true si el marcador queda puesto.
 */
export async function toggleBookmark(
  data: Omit<NewAnnotation, "kind">,
  matches: (bookmark: Annotation) => boolean,
  database: IrakurriDB = defaultDb,
): Promise<boolean> {
  const existing = (await listAnnotations(data.bookId, database)).filter((a) => a.kind === "bookmark" && matches(a));
  if (existing.length) {
    await database.annotations.bulkDelete(existing.map((a) => a.id));
    return false;
  }
  await addAnnotation({ ...data, kind: "bookmark" }, database);
  return true;
}

// ── Geometría de subrayados en PDF ────────────────────────────────────────────

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Convierte los rectángulos de una selección (en píxeles de pantalla) a
 * fracciones de la página (0–1), para que el subrayado se mantenga en su
 * sitio con cualquier zoom. Une los trozos de una misma línea.
 */
export function normalizeRects(rects: Box[], page: Box): NormRect[] {
  if (page.width <= 0 || page.height <= 0) return [];
  const norm = rects
    .filter((r) => r.width > 0.5 && r.height > 0.5)
    .map((r) => ({
      x: (r.left - page.left) / page.width,
      y: (r.top - page.top) / page.height,
      w: r.width / page.width,
      h: r.height / page.height,
    }))
    .filter((r) => r.x < 1 && r.y < 1 && r.x + r.w > 0 && r.y + r.h > 0)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const merged: NormRect[] = [];
  for (const r of norm) {
    const last = merged[merged.length - 1];
    const sameLine = last && Math.abs(last.y - r.y) < last.h * 0.5 && Math.abs(last.h - r.h) < last.h * 0.5;
    const touching = last && r.x <= last.x + last.w + 0.01;
    if (last && sameLine && touching) {
      const right = Math.max(last.x + last.w, r.x + r.w);
      const bottom = Math.max(last.y + last.h, r.y + r.h);
      last.x = Math.min(last.x, r.x);
      last.y = Math.min(last.y, r.y);
      last.w = right - last.x;
      last.h = bottom - last.y;
    } else {
      merged.push({ ...r });
    }
  }
  return merged.map((r) => ({
    x: Math.max(0, r.x),
    y: Math.max(0, r.y),
    w: Math.min(1, r.x + r.w) - Math.max(0, r.x),
    h: Math.min(1, r.y + r.h) - Math.max(0, r.y),
  }));
}

/** ¿El punto (en fracciones de página) cae sobre algún subrayado? Devuelve el primero. */
export function hitTest(annotations: Annotation[], x: number, y: number): Annotation | undefined {
  return annotations.find((a) =>
    a.rects?.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h),
  );
}

/** Recorta textos largos para mostrarlos en listas. */
export function excerpt(text: string, max = 280): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}
