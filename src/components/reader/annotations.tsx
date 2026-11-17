"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import {
  deleteAnnotation,
  excerpt,
  HIGHLIGHT_COLORS,
  listAnnotations,
  updateAnnotation,
} from "@/lib/annotations";
import type { Annotation, HighlightColor } from "@/lib/types";

/** Colores del lector en curso (cada lector tiene su propio tema). */
export interface ReaderPalette {
  background: string;
  text: string;
  accent: string;
}

export function useAnnotations(bookId: string): Annotation[] {
  return useLiveQuery(() => listAnnotations(bookId), [bookId]) ?? [];
}

const COLOR_KEYS = Object.keys(HIGHLIGHT_COLORS) as HighlightColor[];
const iconBtn = "rounded-md px-2.5 py-1.5 text-sm hover:bg-black/10 disabled:opacity-35";

export function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 3h12v18l-6-4-6 4z" />
    </svg>
  );
}

export function NotesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 4h16v12H8l-4 4z" />
      <path d="M8 8h8M8 12h5" />
    </svg>
  );
}

export type SelectionAiAction = "explicar" | "traducir" | "resumir";

/** Barra que aparece al seleccionar texto: subrayar, añadir nota o pedir ayuda a la IA. */
export function SelectionToolbar({
  palette,
  onHighlight,
  onAi,
  onCancel,
}: {
  palette: ReaderPalette;
  onHighlight: (color: HighlightColor, withNote: boolean) => void;
  onAi?: (action: SelectionAiAction) => void;
  onCancel: () => void;
}) {
  const [aiMenu, setAiMenu] = useState(false);

  if (aiMenu && onAi) {
    return (
      <div
        role="toolbar"
        aria-label="Asistente de IA"
        className="fixed bottom-20 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-black/10 px-2 py-2 shadow-xl"
        style={{ background: palette.background, color: palette.text }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <button type="button" className={iconBtn} onClick={() => setAiMenu(false)} aria-label="Volver">
          ‹
        </button>
        {(
          [
            ["explicar", "Explicar"],
            ["traducir", "Traducir"],
            ["resumir", "Resumir"],
          ] as const
        ).map(([action, label]) => (
          <button key={action} type="button" className={`${iconBtn} font-medium`} onClick={() => onAi(action)}>
            {label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      role="toolbar"
      aria-label="Subrayar selección"
      className="fixed bottom-20 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-black/10 px-3 py-2 shadow-xl"
      style={{ background: palette.background, color: palette.text }}
      // Evita que el toque en la barra borre la selección antes de leerla
      onMouseDown={(e) => e.preventDefault()}
    >
      {COLOR_KEYS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onHighlight(c, false)}
          className="h-8 w-8 rounded-full border-2 border-black/10"
          style={{ background: HIGHLIGHT_COLORS[c].fill }}
          aria-label={`Subrayar en ${HIGHLIGHT_COLORS[c].label.toLowerCase()}`}
        />
      ))}
      <button type="button" className={`${iconBtn} font-medium`} onClick={() => onHighlight("amarillo", true)}>
        + Nota
      </button>
      {onAi && (
        <button type="button" className={`${iconBtn} font-medium`} onClick={() => setAiMenu(true)} aria-label="Asistente de IA">
          ✨ IA
        </button>
      )}
      <button type="button" className={iconBtn} onClick={onCancel} aria-label="Cancelar">
        ✕
      </button>
    </div>
  );
}

/** Hoja inferior para editar la nota y el color de un subrayado o marcador. */
export function AnnotationEditor({
  annotation,
  palette,
  onClose,
}: {
  annotation: Annotation;
  palette: ReaderPalette;
  onClose: () => void;
}) {
  const [note, setNote] = useState(annotation.note ?? "");
  const [color, setColor] = useState<HighlightColor | undefined>(annotation.color);

  const save = async () => {
    await updateAnnotation(annotation.id, { note, ...(color ? { color } : {}) });
    onClose();
  };
  const remove = async () => {
    if (window.confirm(annotation.kind === "bookmark" ? "¿Quitar este marcador?" : "¿Borrar este subrayado y su nota?")) {
      await deleteAnnotation(annotation.id);
      onClose();
    }
  };

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-black/30" aria-label="Cerrar" onClick={onClose} />
      <section
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg space-y-4 rounded-t-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl"
        style={{ background: palette.background, color: palette.text }}
        aria-label="Editar nota"
      >
        <blockquote
          className="max-h-32 overflow-y-auto border-l-4 pl-3 font-serif text-sm italic opacity-90"
          style={{ borderColor: color ? HIGHLIGHT_COLORS[color].fill : palette.accent }}
        >
          {excerpt(annotation.text, 500)}
        </blockquote>

        {annotation.kind === "highlight" && (
          <div className="flex gap-3">
            {COLOR_KEYS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="h-8 w-8 rounded-full border-2"
                style={{ background: HIGHLIGHT_COLORS[c].fill, borderColor: c === color ? palette.text : "transparent" }}
                aria-label={HIGHLIGHT_COLORS[c].label}
                aria-pressed={c === color}
              />
            ))}
          </div>
        )}

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Escribe una nota…"
          rows={4}
          autoFocus={!annotation.note}
          className="w-full resize-none rounded-lg border border-black/15 bg-transparent p-3 text-sm outline-none focus:border-current"
        />

        <div className="flex items-center justify-between">
          <button type="button" onClick={remove} className="text-sm text-red-600 underline">
            Borrar
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={iconBtn}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              className="rounded-full px-5 py-2 text-sm font-semibold text-white"
              style={{ background: palette.accent }}
            >
              Guardar
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

/** Panel lateral con todos los marcadores, subrayados y notas del libro. */
export function AnnotationsPanel({
  annotations,
  palette,
  locationLabel,
  onGo,
  onEdit,
  onClose,
}: {
  annotations: Annotation[];
  palette: ReaderPalette;
  locationLabel: (a: Annotation) => string;
  onGo: (a: Annotation) => void;
  onEdit: (a: Annotation) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<"todo" | "bookmark" | "highlight">("todo");
  const shown = filter === "todo" ? annotations : annotations.filter((a) => a.kind === filter);
  const tabs = [
    ["todo", "Todo"],
    ["highlight", "Subrayados"],
    ["bookmark", "Marcadores"],
  ] as const;

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-black/30" aria-label="Cerrar" onClick={onClose} />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-[88%] max-w-sm flex-col shadow-xl"
        style={{ background: palette.background, color: palette.text }}
        aria-label="Notas y marcadores"
      >
        <header className="flex items-center justify-between p-4 pb-2">
          <h2 className="font-serif text-lg font-bold">Notas y marcadores</h2>
          <button type="button" className={iconBtn} onClick={onClose} aria-label="Cerrar panel">
            ✕
          </button>
        </header>
        <div className="flex gap-1 px-4 pb-2">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className="rounded-full px-3 py-1 text-xs"
              style={filter === key ? { background: palette.accent, color: "white" } : { border: "1px solid rgba(128,128,128,.35)" }}
            >
              {label}
            </button>
          ))}
        </div>

        <ul className="flex-1 overflow-y-auto px-2 pb-6">
          {shown.length === 0 && (
            <li className="px-3 py-8 text-center text-sm opacity-60">
              {annotations.length === 0
                ? "Selecciona texto para subrayarlo, o pulsa el marcador para guardar la página."
                : "No hay nada en esta categoría."}
            </li>
          )}
          {shown.map((a) => (
            <li key={a.id} className="group flex items-start gap-2 rounded-lg px-2 py-3 hover:bg-black/5">
              <span
                className="mt-1 h-10 w-1.5 shrink-0 rounded-full"
                style={{ background: a.kind === "bookmark" ? palette.accent : HIGHLIGHT_COLORS[a.color ?? "amarillo"].fill }}
                aria-hidden
              />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onGo(a)}>
                <p className="text-xs opacity-60">
                  {a.kind === "bookmark" ? "Marcador" : "Subrayado"} · {locationLabel(a)}
                </p>
                <p className={`mt-0.5 line-clamp-3 text-sm ${a.kind === "highlight" ? "font-serif" : ""}`}>{excerpt(a.text, 200)}</p>
                {a.note && <p className="mt-1 line-clamp-3 text-sm italic opacity-80">✎ {a.note}</p>}
              </button>
              <button type="button" className={`${iconBtn} shrink-0 text-xs`} onClick={() => onEdit(a)} aria-label="Editar">
                ✎
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </>
  );
}
