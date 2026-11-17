"use client";

import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask, TextLayer } from "pdfjs-dist";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_SECTION_CHARS } from "@/lib/ai/prompts";
import {
  addAnnotation,
  HIGHLIGHT_COLORS,
  hitTest,
  normalizeRects,
  toggleBookmark,
  type NewAnnotation,
} from "@/lib/annotations";
import { markOpened, saveProgress } from "@/lib/db";
import { loadPdfjs } from "@/lib/metadata/pdf";
import {
  clampPage,
  DEFAULT_ZOOM,
  detectSwipe,
  fitScale,
  pageFromLocation,
  pageProgress,
  zoomIn,
  zoomOut,
} from "@/lib/reader/pdfNav";
import type { Annotation, Book, HighlightColor } from "@/lib/types";
import {
  AnnotationEditor,
  AnnotationsPanel,
  BookmarkIcon,
  NotesIcon,
  SelectionToolbar,
  useAnnotations,
  type ReaderPalette,
  type SelectionAiAction,
} from "./annotations";
import { AiSheet, type AiSheetProps } from "./AiSheet";

/** Petición de IA abierta y, si viene de una selección, los datos para guardarla como nota. */
export interface AiState {
  request: AiSheetProps["request"];
  heading?: string;
  selection?: Omit<NewAnnotation, "kind">;
}

const NIGHT_KEY = "irakurri:pdf-night";
const PAGE_PADDING = 16;
const NIGHT_FILTER = "invert(0.9) hue-rotate(180deg)";
const PALETTE: ReaderPalette = { background: "var(--surface)", text: "var(--foreground)", accent: "var(--accent)" };

function readNightPref(): boolean {
  try {
    return localStorage.getItem(NIGHT_KEY) === "1";
  } catch {
    return false;
  }
}

function errorMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "PasswordException") return "Este PDF está protegido con contraseña y todavía no se puede abrir.";
  if (name === "InvalidPDFException") return "El archivo está dañado o no es un PDF válido.";
  return "No se pudo abrir el PDF.";
}

/** Texto seleccionado dentro de la página, si lo hay. */
function pageSelection(container: HTMLElement | null): Selection | null {
  const sel = window.getSelection();
  if (!container || !sel || sel.isCollapsed || !sel.toString().trim()) return null;
  return container.contains(sel.anchorNode) ? sel : null;
}

export function PdfReader({ book }: { book: Book }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [barsVisible, setBarsVisible] = useState(true);
  // El lector se carga solo en el navegador (ssr: false), así que localStorage existe
  const [night, setNight] = useState(readNightPref);
  const [panel, setPanel] = useState<null | "view" | "notes">(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [editing, setEditing] = useState<Annotation | null>(null);
  const [ai, setAi] = useState<AiState | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const annotations = useAnnotations(book.id);
  const pageHighlights = useMemo(
    () => annotations.filter((a) => a.kind === "highlight" && a.location === String(page)),
    [annotations, page],
  );
  const bookmarked = annotations.some((a) => a.kind === "bookmark" && a.location === String(page));

  const toggleNight = () =>
    setNight((n) => {
      try {
        localStorage.setItem(NIGHT_KEY, n ? "0" : "1");
      } catch {
        /* almacenamiento no disponible: se mantiene solo en esta sesión */
      }
      return !n;
    });

  // 1. Cargar el documento una sola vez por libro
  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | undefined;
    void markOpened(book.id);

    (async () => {
      const pdfjs = await loadPdfjs();
      const data = new Uint8Array(await book.file.arrayBuffer());
      task = pdfjs.getDocument({ data });
      const loaded = await task.promise;
      if (cancelled) return;
      setDoc(loaded);
      setNumPages(loaded.numPages);
      setPage(pageFromLocation(book.location, loaded.numPages));
    })().catch((err) => {
      if (!cancelled) setError(errorMessage(err));
    });

    return () => {
      cancelled = true;
      void task?.destroy();
    };
    // book.file y book.location solo se leen al abrir: no deben recargar el documento
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  // 2. Medir el ancho disponible (rotación del móvil, redimensionar ventana)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth - PAGE_PADDING * 2));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 3. Dibujar la página y su capa de texto. Se prepara todo fuera de pantalla y se
  //    sustituye al terminar (sin parpadeos); si cambia la página a mitad, se cancela.
  useEffect(() => {
    if (!doc || containerWidth <= 0) return;
    let cancelled = false;
    let task: RenderTask | undefined;
    let textLayer: TextLayer | undefined;
    setRendering(true);

    (async () => {
      const pdfjs = await loadPdfjs();
      const pdfPage = await doc.getPage(page);
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = fitScale(containerWidth, base.width) * zoom;
      const cssViewport = pdfPage.getViewport({ scale });
      const dpr = window.devicePixelRatio || 1;
      const viewport = pdfPage.getViewport({ scale: scale * dpr });
      const w = Math.floor(cssViewport.width);
      const h = Math.floor(cssViewport.height);

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.cssText = `position:absolute;inset:0;width:${w}px;height:${h}px`;
      canvas.className = "pdf-canvas";
      canvas.setAttribute("aria-label", `Página ${page}`);

      const textDiv = document.createElement("div");
      textDiv.className = "textLayer";
      textDiv.style.setProperty("--total-scale-factor", String(scale));
      textDiv.style.setProperty("--scale-round-x", "1px");
      textDiv.style.setProperty("--scale-round-y", "1px");

      task = pdfPage.render({ canvas, viewport });
      textLayer = new pdfjs.TextLayer({
        textContentSource: pdfPage.streamTextContent(),
        container: textDiv,
        viewport: cssViewport,
      });
      // Si la capa de texto falla (PDF escaneado sin texto), la página se ve igual
      await Promise.all([task.promise, textLayer.render().catch(() => undefined)]);
      if (cancelled) return;
      hostRef.current?.replaceChildren(canvas, textDiv);
      setPageSize({ w, h });
      setRendering(false);
    })().catch((err) => {
      if (err instanceof Error && err.name === "RenderingCancelledException") return;
      if (!cancelled) {
        setError("No se pudo dibujar esta página.");
        setRendering(false);
      }
    });

    return () => {
      cancelled = true;
      task?.cancel();
      textLayer?.cancel();
    };
  }, [doc, page, zoom, containerWidth]);

  // Al cambiar de página, volver arriba y olvidar la selección
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    window.getSelection()?.removeAllRanges();
  }, [page]);

  // 4. Guardar la posición (con un pequeño retardo para no escribir en cada salto rápido)
  useEffect(() => {
    if (!numPages) return;
    const t = setTimeout(() => {
      void saveProgress(book.id, pageProgress(page, numPages), String(page));
    }, 400);
    return () => clearTimeout(t);
  }, [book.id, page, numPages]);

  // 5. Detectar selección de texto en la página
  useEffect(() => {
    const onChange = () => setHasSelection(pageSelection(pageRef.current) !== null);
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  const go = useCallback(
    (delta: number) => setPage((p) => clampPage(p + delta, numPages)),
    [numPages],
  );

  // Teclado (escritorio)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") go(1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
      else if (e.key === "+" || e.key === "=") setZoom(zoomIn);
      else if (e.key === "-") setZoom(zoomOut);
      else if (e.key === "0") setZoom(DEFAULT_ZOOM);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  /** Lee la selección actual (texto y zonas) y la borra de la pantalla. */
  const captureSelection = (): Omit<NewAnnotation, "kind"> | null => {
    const sel = pageSelection(pageRef.current);
    const pageEl = pageRef.current;
    if (!sel || !pageEl || !numPages) return null;
    const rects = normalizeRects(Array.from(sel.getRangeAt(0).getClientRects()), pageEl.getBoundingClientRect());
    const text = sel.toString().trim();
    sel.removeAllRanges();
    setHasSelection(false);
    if (!rects.length || !text) return null;
    return { bookId: book.id, location: String(page), order: (page - 1 + rects[0].y) / numPages, text, rects };
  };

  const createHighlight = async (color: HighlightColor, withNote: boolean) => {
    const data = captureSelection();
    if (!data) return;
    const created = await addAnnotation({ ...data, kind: "highlight", color });
    if (withNote) setEditing(created);
  };

  const askAboutSelection = (action: SelectionAiAction) => {
    const data = captureSelection();
    if (data) setAi({ request: { action, text: data.text, title: book.title, author: book.author }, selection: data });
  };

  const summarizePage = async () => {
    if (!doc) return;
    setPanel(null);
    const content = await (await doc.getPage(page)).getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
      .join("")
      .trim();
    if (!text) {
      window.alert("Esta página no contiene texto (puede ser una imagen escaneada).");
      return;
    }
    setAi({
      request: { action: "resumir-seccion", text: text.slice(0, MAX_SECTION_CHARS), title: book.title, author: book.author },
      heading: `Resumen de la página ${page}`,
    });
  };

  const onToggleBookmark = () =>
    void toggleBookmark(
      { bookId: book.id, location: String(page), order: (page - 1) / Math.max(1, numPages), text: `Página ${page}` },
      (b) => b.location === String(page),
    );

  // Toque: sobre un subrayado = editarlo; tercio izquierdo/derecho = pasar página; centro = barras
  const onPageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (pageSelection(pageRef.current)) return;
    const pageEl = pageRef.current;
    if (pageEl) {
      const r = pageEl.getBoundingClientRect();
      const hit = hitTest(pageHighlights, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      if (hit) return setEditing(hit);
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    if (zoom <= 1 && x < 0.25) go(-1);
    else if (zoom <= 1 && x > 0.75) go(1);
    else setBarsVisible((v) => !v);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    // Con zoom la página se desplaza en horizontal; al seleccionar texto el dedo también se mueve
    if (!start || zoom > 1 || pageSelection(pageRef.current)) return;
    const t = e.changedTouches[0];
    const swipe = detectSwipe(t.clientX - start.x, t.clientY - start.y);
    if (swipe) go(swipe === "next" ? 1 : -1);
  };

  const barClass = `fixed inset-x-0 z-20 flex items-center gap-1 border-border bg-surface/95 px-2 backdrop-blur transition-transform duration-200`;
  const btn = "shrink-0 rounded-md px-2 py-1.5 text-sm hover:bg-border disabled:opacity-40";

  return (
    <div className="h-[100dvh] overflow-hidden bg-background">
      {/* Barra superior */}
      <header className={`${barClass} top-0 h-14 border-b ${barsVisible || panel ? "" : "-translate-y-full"}`}>
        <a href="/" className={btn} aria-label="Volver a la biblioteca">
          ←
        </a>
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{book.title}</h1>
        <button
          type="button"
          className={btn}
          onClick={onToggleBookmark}
          disabled={!numPages}
          aria-pressed={bookmarked}
          aria-label={bookmarked ? "Quitar marcador" : "Añadir marcador"}
          style={bookmarked ? { color: "var(--accent)" } : undefined}
        >
          <BookmarkIcon filled={bookmarked} />
        </button>
        <button type="button" className={btn} onClick={() => setPanel("notes")} aria-label="Notas y marcadores">
          <NotesIcon />
        </button>
        <button type="button" className={btn} onClick={() => void summarizePage()} disabled={!doc} aria-label="Resumir esta página con IA">
          ✨
        </button>
        <button
          type="button"
          className={`${btn} font-serif`}
          onClick={() => setPanel(panel === "view" ? null : "view")}
          aria-label="Vista"
          aria-expanded={panel === "view"}
        >
          Aa
        </button>
      </header>

      {/* Menú de vista: zoom y modo noche */}
      {panel === "view" && (
        <div className="fixed right-2 top-16 z-30 flex items-center gap-1 rounded-xl border border-border bg-surface p-2 shadow-lg">
          <button type="button" className={btn} onClick={() => setZoom(zoomOut)} aria-label="Reducir">
            −
          </button>
          <button type="button" className={`${btn} min-w-14 tabular-nums`} onClick={() => setZoom(DEFAULT_ZOOM)} title="Ajustar a la anchura">
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" className={btn} onClick={() => setZoom(zoomIn)} aria-label="Ampliar">
            +
          </button>
          <span className="mx-1 h-6 w-px bg-border" />
          <button type="button" className={btn} onClick={toggleNight} aria-pressed={night} title={night ? "Modo día" : "Modo noche"}>
            {night ? "☀" : "☾"}
          </button>
        </div>
      )}

      {/* Página */}
      <div
        ref={scrollRef}
        className="h-full overflow-auto overscroll-contain"
        style={{ paddingTop: 72, paddingBottom: 96 }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={() => panel === "view" && setPanel(null)}
      >
        {error ? (
          <div className="mx-auto mt-16 max-w-sm px-6 text-center">
            <p className="font-medium">{error}</p>
            <a href="/" className="mt-4 inline-block text-accent underline">
              Volver a la biblioteca
            </a>
          </div>
        ) : (
          <div className="flex min-w-fit justify-center px-4" onClick={onPageClick}>
            <div
              ref={pageRef}
              className={`relative bg-white shadow-md transition-opacity ${rendering ? "opacity-70" : ""}`}
              style={pageSize ? { width: pageSize.w, height: pageSize.h } : undefined}
            >
              {/* Lienzo + capa de texto (los inserta pdf.js) */}
              <div ref={hostRef} className="absolute inset-0" style={night ? { filter: NIGHT_FILTER } : undefined} />
              {/* Subrayados: entre el dibujo y la capa de texto, para no impedir la selección */}
              <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden>
                {pageHighlights.flatMap((a) =>
                  (a.rects ?? []).map((r, i) => (
                    <div
                      key={`${a.id}-${i}`}
                      className="absolute rounded-[2px]"
                      style={{
                        left: `${r.x * 100}%`,
                        top: `${r.y * 100}%`,
                        width: `${r.w * 100}%`,
                        height: `${r.h * 100}%`,
                        background: HIGHLIGHT_COLORS[a.color ?? "amarillo"].fill,
                        opacity: night ? 0.35 : 0.4,
                        mixBlendMode: night ? "normal" : "multiply",
                      }}
                    />
                  )),
                )}
              </div>
            </div>
            {!doc && <p className="mt-16 text-muted">Abriendo…</p>}
          </div>
        )}
      </div>

      {/* Barra inferior */}
      {numPages > 0 && (
        <footer
          className={`${barClass} bottom-0 h-16 border-t pb-[env(safe-area-inset-bottom)] ${barsVisible || panel ? "" : "translate-y-full"}`}
        >
          <button type="button" className={btn} onClick={() => go(-1)} disabled={page <= 1} aria-label="Página anterior">
            ‹
          </button>
          <input
            type="range"
            min={1}
            max={numPages}
            value={page}
            onChange={(e) => setPage(clampPage(Number(e.target.value), numPages))}
            className="flex-1 accent-[var(--accent)]"
            aria-label="Ir a la página"
          />
          <span className="w-20 text-center text-sm tabular-nums text-muted">
            {page} / {numPages}
          </span>
          <button type="button" className={btn} onClick={() => go(1)} disabled={page >= numPages} aria-label="Página siguiente">
            ›
          </button>
        </footer>
      )}

      {hasSelection && !editing && !ai && (
        <SelectionToolbar
          palette={PALETTE}
          onHighlight={(c, withNote) => void createHighlight(c, withNote)}
          onAi={askAboutSelection}
          onCancel={() => window.getSelection()?.removeAllRanges()}
        />
      )}

      {ai && (
        <AiSheet
          request={ai.request}
          heading={ai.heading}
          palette={PALETTE}
          onClose={() => setAi(null)}
          onSaveNote={
            ai.selection
              ? async (result) => {
                  await addAnnotation({ ...ai.selection!, kind: "highlight", color: "azul", note: result });
                }
              : undefined
          }
        />
      )}

      {panel === "notes" && (
        <AnnotationsPanel
          annotations={annotations}
          palette={PALETTE}
          locationLabel={(a) => `Pág. ${a.location}`}
          onGo={(a) => {
            setPanel(null);
            setPage(clampPage(Number(a.location), numPages));
          }}
          onEdit={(a) => {
            setPanel(null);
            setEditing(a);
          }}
          onClose={() => setPanel(null)}
        />
      )}

      {editing && <AnnotationEditor key={editing.id} annotation={editing} palette={PALETTE} onClose={() => setEditing(null)} />}
    </div>
  );
}
