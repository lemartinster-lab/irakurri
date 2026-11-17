"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AiError, askAi, getAccessCode, setAccessCode } from "@/lib/ai/client";
import { LANGUAGES, type AiAction, type AiRequest, type LangCode } from "@/lib/ai/prompts";
import { excerpt } from "@/lib/annotations";
import type { ReaderPalette } from "./annotations";

const LANG_KEY = "irakurri:ai-lang";

export const AI_TITLES: Record<AiAction, string> = {
  explicar: "Explicación",
  traducir: "Traducción",
  resumir: "Resumen",
  "resumir-seccion": "Resumen",
};

function readLang(): LangCode {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v && Object.hasOwn(LANGUAGES, v) ? (v as LangCode) : "es";
  } catch {
    return "es";
  }
}

export interface AiSheetProps {
  request: Omit<AiRequest, "lang">;
  /** Título a mostrar (p. ej. "Resumen del capítulo") */
  heading?: string;
  palette: ReaderPalette;
  onClose: () => void;
  /** Si se indica, aparece "Guardar como nota" (subraya la selección con el resultado) */
  onSaveNote?: (result: string) => Promise<void> | void;
}

type Status = "loading" | "done" | "error" | "needs-code";

export function AiSheet({ request, heading, palette, onClose, onSaveNote }: AiSheetProps) {
  const [lang, setLang] = useState<LangCode>(readLang);
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [code, setCode] = useState(getAccessCode);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");
    setOutput("");
    setError("");
    setSaved(false);
    try {
      await askAi(
        { ...request, ...(request.action === "traducir" ? { lang } : {}) },
        { onText: setOutput, signal: controller.signal },
      );
      if (!controller.signal.aborted) setStatus("done");
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof AiError && err.kind === "code") {
        setStatus("needs-code");
        setError(getAccessCode() ? "El código no es correcto." : "");
      } else {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Error desconocido");
      }
    }
  }, [request, lang]);

  // Lanzar al abrir y al cambiar de idioma; cancelar al cerrar
  useEffect(() => {
    void run();
    return () => abortRef.current?.abort();
  }, [run]);

  const changeLang = (l: LangCode) => {
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* no se recuerda, sin más */
    }
    setLang(l);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* el navegador no permite copiar: el texto sigue seleccionable */
    }
  };

  const btn = "rounded-full px-4 py-2 text-sm border border-black/15 hover:bg-black/5 disabled:opacity-40";

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-black/30" aria-label="Cerrar" onClick={onClose} />
      <section
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[80dvh] max-w-lg flex-col rounded-t-2xl shadow-2xl"
        style={{ background: palette.background, color: palette.text }}
        aria-label="Asistente de lectura"
        aria-busy={status === "loading"}
      >
        <header className="flex items-center gap-2 p-5 pb-3">
          <span aria-hidden>✨</span>
          <h2 className="flex-1 font-serif text-lg font-bold">{heading ?? AI_TITLES[request.action]}</h2>
          {request.action === "traducir" && (
            <select
              value={lang}
              onChange={(e) => changeLang(e.target.value as LangCode)}
              className="rounded-md border border-black/15 bg-transparent px-2 py-1 text-sm"
              aria-label="Idioma de destino"
            >
              {(Object.keys(LANGUAGES) as LangCode[]).map((l) => (
                <option key={l} value={l}>
                  al {LANGUAGES[l]}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 hover:bg-black/10" aria-label="Cerrar asistente">
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5">
          {request.action !== "resumir-seccion" && (
            <blockquote className="mb-4 border-l-4 pl-3 font-serif text-sm italic opacity-70" style={{ borderColor: palette.accent }}>
              {excerpt(request.text, 240)}
            </blockquote>
          )}

          {status === "needs-code" ? (
            <form
              className="space-y-3 pb-4"
              onSubmit={(e) => {
                e.preventDefault();
                setAccessCode(code);
                void run();
              }}
            >
              <p className="text-sm">Esta instalación de Irakurri pide un código de acceso para usar la IA.</p>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <input
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Código de acceso"
                autoFocus
                className="w-full rounded-lg border border-black/15 bg-transparent p-3 text-sm"
              />
              <button type="submit" className="rounded-full px-5 py-2 text-sm font-semibold text-white" style={{ background: palette.accent }}>
                Guardar y continuar
              </button>
            </form>
          ) : status === "error" ? (
            <div className="space-y-3 pb-4">
              <p className="text-sm text-red-600">{error}</p>
              <button type="button" className={btn} onClick={() => void run()}>
                Reintentar
              </button>
            </div>
          ) : (
            <div className="whitespace-pre-wrap pb-4 text-[15px] leading-relaxed" aria-live="polite">
              {output}
              {status === "loading" && <span className="ml-0.5 inline-block animate-pulse">▍</span>}
            </div>
          )}
        </div>

        <footer className="space-y-3 border-t border-black/10 p-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={() => void copy()} disabled={status !== "done"}>
              {copied ? "Copiado ✓" : "Copiar"}
            </button>
            {onSaveNote && (
              <button
                type="button"
                className={btn}
                disabled={status !== "done" || saved}
                onClick={async () => {
                  await onSaveNote(output.trim());
                  setSaved(true);
                }}
              >
                {saved ? "Guardado ✓" : "Guardar como nota"}
              </button>
            )}
          </div>
          <p className="text-xs opacity-55">El texto se envía a Claude (Anthropic) para procesarlo. Tus libros no salen del dispositivo.</p>
        </footer>
      </section>
    </>
  );
}
