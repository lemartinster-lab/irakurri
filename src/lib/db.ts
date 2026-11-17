import Dexie, { type EntityTable } from "dexie";
import { cleanAuthor } from "./format";
import type { Annotation, Book } from "./types";

/**
 * Base de datos local (IndexedDB). Los libros nunca salen del dispositivo.
 * Cada cambio de esquema debe añadir una nueva versión, nunca modificar una existente.
 */
export class IrakurriDB extends Dexie {
  books!: EntityTable<Book, "id">;
  annotations!: EntityTable<Annotation, "id">;

  constructor(name = "irakurri") {
    super(name);
    this.version(1).stores({
      books: "id, title, author, format, addedAt, lastOpenedAt",
    });
    // v2: marcadores y subrayados
    this.version(2).stores({
      annotations: "id, bookId, [bookId+kind], createdAt",
    });
  }
}

export const db = new IrakurriDB();

export async function listBooks(database: IrakurriDB = db): Promise<Book[]> {
  const books = await database.books.toArray();
  return sortBooks(books);
}

/** Los abiertos recientemente primero; después, los añadidos más nuevos. */
export function sortBooks(books: Book[]): Book[] {
  return [...books].sort((a, b) => {
    const ka = a.lastOpenedAt ?? a.addedAt;
    const kb = b.lastOpenedAt ?? b.addedAt;
    return kb - ka;
  });
}

/** Borra el libro junto con sus marcadores y subrayados. */
export async function deleteBook(id: string, database: IrakurriDB = db): Promise<void> {
  await database.transaction("rw", database.books, database.annotations, async () => {
    await database.annotations.where("bookId").equals(id).delete();
    await database.books.delete(id);
  });
}

/**
 * Cambia el título y el autor de un libro (p. ej. PDF sin metadatos que muestran
 * el nombre del archivo). El título no puede quedar vacío; el autor vacío pasa a
 * "Autor desconocido". Devuelve los valores guardados.
 */
export async function updateBookInfo(
  id: string,
  info: { title: string; author: string },
  database: IrakurriDB = db,
): Promise<{ title: string; author: string }> {
  const title = info.title.replace(/\s+/g, " ").trim().slice(0, 300);
  if (!title) throw new Error("El título no puede quedar vacío.");
  const author = cleanAuthor(info.author.replace(/\s+/g, " ").slice(0, 200));
  const updated = await database.books.update(id, { title, author });
  if (!updated) throw new Error("El libro ya no está en la biblioteca.");
  return { title, author };
}

/** Registra la apertura para que el libro suba al principio de la biblioteca. */
export async function markOpened(id: string, database: IrakurriDB = db): Promise<void> {
  await database.books.update(id, { lastOpenedAt: Date.now() });
}

export async function saveEpubLocations(id: string, locations: string, database: IrakurriDB = db): Promise<void> {
  await database.books.update(id, { epubLocations: locations });
}

export async function saveProgress(
  id: string,
  progress: number,
  location: string,
  database: IrakurriDB = db,
): Promise<void> {
  await database.books.update(id, {
    progress: Math.min(1, Math.max(0, progress)),
    location,
    lastOpenedAt: Date.now(),
  });
}
