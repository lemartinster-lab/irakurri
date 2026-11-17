"use client";

import { useState } from "react";
import type { ReaderPalette } from "./annotations";

/**
 * Título de la cabecera del lector. En el móvil casi nunca cabe entero:
 * al tocarlo se abre una tarjeta con el título completo, el autor y la posición.
 */
export function ReaderTitle({
  title,
  author,
  subtitle,
  palette,
}: {
  title: string;
  author?: string;
  /** Capítulo actual (EPUB) o página (PDF) */
  subtitle?: string;
  palette: ReaderPalette;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="min-w-0 flex-1 rounded-md px-1 py-0.5 text-left hover:bg-black/5"
        aria-expanded={open}
        aria-label={`${title}. Ver título completo`}
      >
        <h1 className="truncate text-sm font-medium">{title}</h1>
        {subtitle && <p className="truncate text-xs opacity-60">{subtitle}</p>}
      </button>

      {open && (
        <>
          <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Cerrar" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Datos del libro"
            className="fixed inset-x-2 top-14 z-40 mx-auto max-w-md rounded-xl border border-black/10 p-4 shadow-xl"
            style={{ background: palette.background, color: palette.text }}
            onClick={() => setOpen(false)}
          >
            <p className="font-serif text-lg font-bold leading-snug">{title}</p>
            {author && <p className="mt-1 text-sm opacity-70">{author}</p>}
            {subtitle && (
              <p className="mt-3 border-t border-black/10 pt-3 text-sm">
                <span className="opacity-60">Ahora: </span>
                {subtitle}
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}
