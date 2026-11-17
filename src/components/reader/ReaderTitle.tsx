"use client";

import { useState } from "react";
import type { ReaderPalette } from "./annotations";

/**
 * Título de la cabecera del lector. En el móvil casi nunca cabe entero:
 * al tocarlo se abre una tarjeta con el título completo, el autor y la posición,
 * desde la que también se pueden corregir título y autor.
 */
export function ReaderTitle({
  title,
  author,
  subtitle,
  palette,
  onEdit,
}: {
  title: string;
  author?: string;
  /** Capítulo actual (EPUB) o página (PDF) */
  subtitle?: string;
  palette: ReaderPalette;
  /** Guarda el nuevo título/autor; si falla, debe lanzar un Error con el motivo */
  onEdit?: (info: { title: string; author: string }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftAuthor, setDraftAuthor] = useState(author ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const close = () => {
    setOpen(false);
    setEditing(false);
    setError(null);
  };

  const startEditing = () => {
    setDraftTitle(title);
    // "Autor desconocido" no es un autor real: se empieza con el campo vacío
    setDraftAuthor(author && author !== "Autor desconocido" ? author : "");
    setError(null);
    setEditing(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onEdit) return;
    setSaving(true);
    setError(null);
    try {
      await onEdit({ title: draftTitle, author: draftAuthor });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full rounded-lg border border-black/15 bg-transparent p-2.5 text-sm";
  const smallBtn = "rounded-full border border-black/15 px-4 py-1.5 text-sm hover:bg-black/5";

  return (
    <>
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        className="min-w-0 flex-1 rounded-md px-1 py-0.5 text-left hover:bg-black/5"
        aria-expanded={open}
        aria-label={`${title}. Ver título completo`}
      >
        <h1 className="truncate text-sm font-medium">{title}</h1>
        {subtitle && <p className="truncate text-xs opacity-60">{subtitle}</p>}
      </button>

      {open && (
        <>
          <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Cerrar" onClick={close} />
          <div
            role="dialog"
            aria-label="Datos del libro"
            className="fixed inset-x-2 top-14 z-40 mx-auto max-w-md rounded-xl border border-black/10 p-4 shadow-xl"
            style={{ background: palette.background, color: palette.text }}
          >
            {editing ? (
              <form onSubmit={save} className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide opacity-60">Título</span>
                  <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} className={field} autoFocus required maxLength={300} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide opacity-60">Autor</span>
                  <input
                    value={draftAuthor}
                    onChange={(e) => setDraftAuthor(e.target.value)}
                    className={field}
                    placeholder="Autor desconocido"
                    maxLength={200}
                  />
                </label>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" className={smallBtn} onClick={() => setEditing(false)}>
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-full px-5 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: palette.accent }}
                  >
                    Guardar
                  </button>
                </div>
              </form>
            ) : (
              <>
                <p className="font-serif text-lg font-bold leading-snug">{title}</p>
                {author && <p className="mt-1 text-sm opacity-70">{author}</p>}
                {subtitle && (
                  <p className="mt-3 border-t border-black/10 pt-3 text-sm">
                    <span className="opacity-60">Ahora: </span>
                    {subtitle}
                  </p>
                )}
                {onEdit && (
                  <div className="mt-3 flex justify-end">
                    <button type="button" className={smallBtn} onClick={startEditing}>
                      ✎ Editar título y autor
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
