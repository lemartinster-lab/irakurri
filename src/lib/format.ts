import type { BookFormat } from "./types";

const MIME_TO_FORMAT: Record<string, BookFormat> = {
  "application/pdf": "pdf",
  "application/epub+zip": "epub",
};

/**
 * Detecta el formato de un archivo por su tipo MIME o, si el navegador
 * no lo informa (frecuente en Android con EPUB), por la extensión.
 */
export function detectFormat(file: { name: string; type?: string }): BookFormat | null {
  if (file.type && MIME_TO_FORMAT[file.type]) return MIME_TO_FORMAT[file.type];
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "pdf") return "pdf";
  if (ext === "epub") return "epub";
  return null;
}

/** Convierte "mi_libro-favorito.pdf" en "mi libro favorito" como título de reserva. */
export function titleFromFilename(name: string): string {
  const withoutExt = name.replace(/\.[^.]+$/, "");
  const cleaned = withoutExt.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || "Sin título";
}

/** Valores de relleno que algunos programas escriben como autor y no aportan nada. */
const PLACEHOLDER_AUTHORS = new Set(["anonymous", "unknown", "author", "user", "admin", "desconocido"]);

export function cleanAuthor(author: string | undefined): string {
  const trimmed = author?.trim() ?? "";
  if (!trimmed || PLACEHOLDER_AUTHORS.has(trimmed.toLowerCase())) return "Autor desconocido";
  return trimmed;
}

export function formatProgress(progress: number): string {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  return `${Math.round(clamped * 100)} %`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
