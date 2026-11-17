"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import type { Book } from "@/lib/types";

// pdf.js solo funciona en el navegador
const PdfReader = dynamic(() => import("@/components/reader/PdfReader").then((m) => m.PdfReader), {
  ssr: false,
  loading: () => <p className="mt-24 text-center text-muted">Abriendo…</p>,
});

const EpubReader = dynamic(() => import("@/components/reader/EpubReader").then((m) => m.EpubReader), {
  ssr: false,
  loading: () => <p className="mt-24 text-center text-muted">Abriendo…</p>,
});

export default function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  // Se lee una sola vez: el lector guarda el progreso y no debe recargarse por ello.
  // undefined = cargando; null = no existe
  const [book, setBook] = useState<Book | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    db.books.get(id).then((b) => active && setBook(b ?? null));
    return () => {
      active = false;
    };
  }, [id]);

  if (book === undefined) return <p className="mt-24 text-center text-muted">Cargando…</p>;

  if (book?.format === "pdf") return <PdfReader key={book.id} book={book} />;
  if (book?.format === "epub") return <EpubReader key={book.id} book={book} />;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-muted">Este libro ya no está en la biblioteca.</p>
      <Link href="/" className="text-accent underline">
        ← Volver a la biblioteca
      </Link>
    </main>
  );
}
