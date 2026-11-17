"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";

/** Marcador de posición: los visores de PDF y EPUB llegan en las fases 2 y 3. */
export default function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  // null = no existe; undefined = aún cargando
  const book = useLiveQuery(async () => (await db.books.get(id)) ?? null, [id]);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      {book === undefined ? (
        <p className="text-muted">Cargando…</p>
      ) : book === null ? (
        <p className="text-muted">Este libro ya no está en la biblioteca.</p>
      ) : (
        <>
          <h1 className="font-serif text-2xl font-bold">{book.title}</h1>
          <p className="text-muted">{book.author}</p>
          <p className="text-sm text-muted">El lector de {book.format.toUpperCase()} estará disponible en la próxima fase.</p>
        </>
      )}
      <Link href="/" className="text-accent underline">
        ← Volver a la biblioteca
      </Link>
    </main>
  );
}
