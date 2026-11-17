import { db as defaultDb, type IrakurriDB } from "./db";
import { detectFormat, titleFromFilename } from "./format";
import type { Book, BookFormat, ExtractedMetadata } from "./types";

export type Extractor = (file: Blob) => Promise<ExtractedMetadata>;
export type Extractors = Record<BookFormat, Extractor>;

export interface ImportResult {
  imported: Book[];
  rejected: { name: string; reason: string }[];
}

/** Carga los extractores reales solo en el navegador (pdf.js y epub.js usan el DOM). */
async function loadDefaultExtractors(): Promise<Extractors> {
  const [{ extractPdfMetadata }, { extractEpubMetadata }] = await Promise.all([
    import("./metadata/pdf"),
    import("./metadata/epub"),
  ]);
  return { pdf: extractPdfMetadata, epub: extractEpubMetadata };
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Importa uno o varios archivos a la biblioteca.
 * Si la extracción de metadatos falla, el libro se guarda igualmente
 * con el nombre del archivo como título: nunca se pierde un archivo por eso.
 */
export async function importFiles(
  files: File[],
  options: { database?: IrakurriDB; extractors?: Extractors } = {},
): Promise<ImportResult> {
  const database = options.database ?? defaultDb;
  const result: ImportResult = { imported: [], rejected: [] };
  let extractors = options.extractors;

  for (const file of files) {
    const format = detectFormat(file);
    if (!format) {
      result.rejected.push({ name: file.name, reason: "Formato no compatible (solo PDF y EPUB)" });
      continue;
    }

    extractors ??= await loadDefaultExtractors();

    let meta: ExtractedMetadata = {};
    try {
      meta = await extractors[format](file);
    } catch (err) {
      console.warn(`No se pudieron leer los metadatos de ${file.name}`, err);
    }

    const book: Book = {
      id: newId(),
      title: meta.title?.trim() || titleFromFilename(file.name),
      author: meta.author?.trim() || "Autor desconocido",
      format,
      file,
      cover: meta.cover,
      size: file.size,
      addedAt: Date.now(),
      progress: 0,
    };

    try {
      await database.books.add(book);
      result.imported.push(book);
    } catch (err) {
      const reason =
        err instanceof Error && err.name === "QuotaExceededError"
          ? "No queda espacio en el dispositivo"
          : "Error al guardar el libro";
      result.rejected.push({ name: file.name, reason });
    }
  }

  return result;
}
