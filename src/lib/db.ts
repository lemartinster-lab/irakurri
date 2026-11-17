import Dexie, { type EntityTable } from "dexie";
import type { Book } from "./types";

/**
 * Base de datos local (IndexedDB). Los libros nunca salen del dispositivo.
 * Cada cambio de esquema debe añadir una nueva versión, nunca modificar una existente.
 */
export class IrakurriDB extends Dexie {
  books!: EntityTable<Book, "id">;

  constructor(name = "irakurri") {
    super(name);
    this.version(1).stores({
      books: "id, title, author, format, addedAt, lastOpenedAt",
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

export async function deleteBook(id: string, database: IrakurriDB = db): Promise<void> {
  await database.books.delete(id);
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
