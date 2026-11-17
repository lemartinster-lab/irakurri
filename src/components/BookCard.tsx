"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatProgress } from "@/lib/format";
import type { Book } from "@/lib/types";

/** Crea una URL temporal para un Blob y la libera al desmontar. */
function useObjectUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return setUrl(undefined);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function BookCard({ book, onDelete }: { book: Book; onDelete: (book: Book) => void }) {
  const coverUrl = useObjectUrl(book.cover);

  return (
    <article className="group relative flex flex-col">
      <Link
        href={`/leer/${book.id}`}
        className="relative block aspect-[2/3] overflow-hidden rounded-md border border-border bg-surface shadow-sm transition group-hover:shadow-md"
        aria-label={`Abrir ${book.title}`}
      >
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob: local, next/image no aporta nada aquí
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col justify-between p-3 font-serif">
            <span className="line-clamp-5 text-sm font-semibold leading-snug">{book.title}</span>
            <span className="line-clamp-2 text-xs text-muted">{book.author}</span>
          </div>
        )}
        <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          {book.format}
        </span>
        {book.progress > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/20">
            <div className="h-full bg-accent" style={{ width: `${book.progress * 100}%` }} />
          </div>
        )}
      </Link>

      <div className="mt-2 flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-medium leading-tight">{book.title}</h3>
          <p className="truncate text-xs text-muted">
            {book.author}
            {book.progress > 0 && ` · ${formatProgress(book.progress)}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDelete(book)}
          className="shrink-0 rounded p-1 text-muted hover:bg-border hover:text-foreground"
          aria-label={`Eliminar ${book.title}`}
          title="Eliminar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
          </svg>
        </button>
      </div>
    </article>
  );
}
