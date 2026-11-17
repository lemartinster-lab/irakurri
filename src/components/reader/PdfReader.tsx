"use client";

import Link from "next/link";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState } from "react";
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
import type { Book } from "@/lib/types";

const NIGHT_KEY = "irakurri:pdf-night";
const PAGE_PADDING = 16;

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

export function PdfReader({ book }: { book: Book }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [containerWidth, setContainerWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [barsVisible, setBarsVisible] = useState(true);
  // El lector se carga solo en el navegador (ssr: false), así que localStorage existe
  const [night, setNight] = useState(readNightPref);

  const scrollRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

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

  // 3. Dibujar la página actual. Se dibuja en un lienzo nuevo y se sustituye al
  //    terminar, para evitar parpadeos; si cambia la página a mitad, se cancela.
  useEffect(() => {
    if (!doc || containerWidth <= 0) return;
    let cancelled = false;
    let task: RenderTask | undefined;
    setRendering(true);

    (async () => {
      const pdfPage = await doc.getPage(page);
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = fitScale(containerWidth, base.width) * zoom;
      const dpr = window.devicePixelRatio || 1;
      const viewport = pdfPage.getViewport({ scale: scale * dpr });

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
      canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
      canvas.className = "block bg-white shadow-md";
      canvas.setAttribute("aria-label", `Página ${page}`);

      task = pdfPage.render({ canvas, viewport });
      await task.promise;
      if (cancelled) return;
      hostRef.current?.replaceChildren(canvas);
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
    };
  }, [doc, page, zoom, containerWidth]);

  // Al cambiar de página, volver arriba
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [page]);

  // 4. Guardar la posición (con un pequeño retardo para no escribir en cada salto rápido)
  useEffect(() => {
    if (!numPages) return;
    const t = setTimeout(() => {
      void saveProgress(book.id, pageProgress(page, numPages), String(page));
    }, 400);
    return () => clearTimeout(t);
  }, [book.id, page, numPages]);

  const go = useCallback(
    (delta: number) => setPage((p) => clampPage(p + delta, numPages)),
    [numPages],
  );

  // Teclado (escritorio)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
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

  // Toque: tercio izquierdo = atrás, derecho = adelante, centro = mostrar/ocultar barras
  const onPageClick = (e: React.MouseEvent<HTMLDivElement>) => {
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
    // Con zoom la página se desplaza en horizontal: el deslizamiento no debe pasar página
    if (!start || zoom > 1) return;
    const t = e.changedTouches[0];
    const swipe = detectSwipe(t.clientX - start.x, t.clientY - start.y);
    if (swipe) go(swipe === "next" ? 1 : -1);
  };

  const barClass = `fixed inset-x-0 z-20 flex items-center gap-2 border-border bg-surface/95 px-3 backdrop-blur transition-transform duration-200`;
  const btn = "rounded-md px-2.5 py-1.5 text-sm hover:bg-border disabled:opacity-40";

  return (
    <div className="h-[100dvh] overflow-hidden bg-background">
      {/* Barra superior */}
      <header
        className={`${barClass} top-0 h-14 border-b ${barsVisible ? "" : "-translate-y-full"}`}
      >
        <Link href="/" className={btn} aria-label="Volver a la biblioteca">
          ←
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{book.title}</h1>
        <button type="button" className={btn} onClick={() => setZoom(zoomOut)} aria-label="Reducir">
          −
        </button>
        <button
          type="button"
          className={`${btn} min-w-14 tabular-nums`}
          onClick={() => setZoom(DEFAULT_ZOOM)}
          title="Ajustar a la anchura"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" className={btn} onClick={() => setZoom(zoomIn)} aria-label="Ampliar">
          +
        </button>
        <button
          type="button"
          className={btn}
          onClick={toggleNight}
          aria-pressed={night}
          title={night ? "Modo día" : "Modo noche"}
        >
          {night ? "☀" : "☾"}
        </button>
      </header>

      {/* Página */}
      <div
        ref={scrollRef}
        className="h-full overflow-auto overscroll-contain"
        style={{ paddingTop: 72, paddingBottom: 96 }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {error ? (
          <div className="mx-auto mt-16 max-w-sm px-6 text-center">
            <p className="font-medium">{error}</p>
            <Link href="/" className="mt-4 inline-block text-accent underline">
              Volver a la biblioteca
            </Link>
          </div>
        ) : (
          <div className="flex min-w-fit justify-center px-4" onClick={onPageClick}>
            <div
              ref={hostRef}
              className={`transition-opacity ${rendering ? "opacity-70" : ""}`}
              style={night ? { filter: "invert(0.9) hue-rotate(180deg)" } : undefined}
            />
            {!doc && <p className="mt-16 text-muted">Abriendo…</p>}
          </div>
        )}
      </div>

      {/* Barra inferior */}
      {numPages > 0 && (
        <footer
          className={`${barClass} bottom-0 h-16 border-t pb-[env(safe-area-inset-bottom)] ${barsVisible ? "" : "translate-y-full"}`}
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
    </div>
  );
}
