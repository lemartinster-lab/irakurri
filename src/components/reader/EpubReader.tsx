"use client";

import type { Book as EpubBook, Location, Rendition } from "epubjs";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { markOpened, saveEpubLocations, saveProgress } from "@/lib/db";
import {
  chapterLabel,
  clampFontSize,
  FONT_SIZE_STEP,
  FONT_STACKS,
  flattenToc,
  LINE_HEIGHTS,
  parseSettings,
  THEME_COLORS,
  type EpubSettings,
  type EpubTheme,
  type FlatTocItem,
} from "@/lib/reader/epubSettings";
import { detectSwipe } from "@/lib/reader/pdfNav";
import type { Book } from "@/lib/types";

const SETTINGS_KEY = "irakurri:epub-settings";
/** Caracteres por "posición": equilibrio entre precisión del progreso y tiempo de cálculo. */
const LOCATION_CHARS = 1600;

function loadSettings(): EpubSettings {
  try {
    return parseSettings(localStorage.getItem(SETTINGS_KEY));
  } catch {
    return parseSettings(null);
  }
}

/**
 * Aplica los ajustes al contenido del libro. Cada combinación se registra como
 * un tema propio de epub.js, porque re-registrar un tema ya inyectado no lo actualiza.
 */
function applySettings(rendition: Rendition, s: EpubSettings) {
  const c = THEME_COLORS[s.theme];
  const name = `irk-${s.theme}-${s.font}-${String(s.lineHeight).replace(".", "_")}`;
  rendition.themes.register(name, {
    body: {
      background: `${c.background} !important`,
      color: `${c.text} !important`,
      "font-family": `${FONT_STACKS[s.font]} !important`,
      "line-height": `${s.lineHeight} !important`,
    },
    "p, li, span, div, blockquote, h1, h2, h3, h4, h5, h6, td, th": {
      color: "inherit !important",
      "font-family": "inherit !important",
      "line-height": "inherit !important",
    },
    a: { color: `${c.link} !important` },
  });
  rendition.themes.select(name);
  rendition.themes.fontSize(`${s.fontSize}%`);
}

export function EpubReader({ book }: { book: Book }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const epubRef = useRef<EpubBook | null>(null);
  const locationsReadyRef = useRef(false);
  const lastCfi = useRef<string | undefined>(book.location);
  const lastProgress = useRef(book.progress);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  // El lector se carga solo en el navegador (ssr: false), así que localStorage existe
  const [settings, setSettings] = useState<EpubSettings>(loadSettings);
  const settingsRef = useRef(settings);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toc, setToc] = useState<FlatTocItem[]>([]);
  const [currentHref, setCurrentHref] = useState<string>();
  const [percent, setPercent] = useState<number | null>(null);
  const [atStart, setAtStart] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const [panel, setPanel] = useState<null | "toc" | "settings">(null);
  const [barsVisible, setBarsVisible] = useState(true);

  const next = useCallback(() => void renditionRef.current?.next(), []);
  const prev = useCallback(() => void renditionRef.current?.prev(), []);

  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (lastCfi.current) void saveProgress(book.id, lastProgress.current, lastCfi.current);
    }, 500);
  }, [book.id]);

  // Toque en una zona de la pantalla (x en coordenadas de la ventana principal)
  const handleTapAt = useCallback(
    (clientX: number) => {
      const host = hostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const rel = (clientX - rect.left) / rect.width;
      if (rel < 0.25) prev();
      else if (rel > 0.75) next();
      else setBarsVisible((v) => !v);
    },
    [next, prev],
  );

  // 1. Abrir el libro y crear la vista paginada
  useEffect(() => {
    let cancelled = false;
    void markOpened(book.id);

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") next();
      else if (e.key === "ArrowLeft" || e.key === "PageUp") prev();
    };

    (async () => {
      const { default: ePub } = await import("epubjs");
      const epub = ePub(await book.file.arrayBuffer());
      if (cancelled || !hostRef.current) return epub.destroy();
      epubRef.current = epub;

      const rendition = epub.renderTo(hostRef.current, {
        width: "100%",
        height: "100%",
        flow: "paginated",
        spread: "none",
        // Seguridad: los scripts que pueda traer un EPUB no se ejecutan
        allowScriptedContent: false,
      });
      renditionRef.current = rendition;
      applySettings(rendition, settingsRef.current);

      rendition.on("relocated", (loc: Location) => {
        lastCfi.current = loc.start.cfi;
        setCurrentHref(loc.start.href);
        setAtStart(loc.atStart);
        setAtEnd(loc.atEnd);
        if (locationsReadyRef.current) {
          const p = loc.atEnd ? 1 : epub.locations.percentageFromCfi(loc.start.cfi);
          lastProgress.current = p;
          setPercent(p);
        }
        scheduleSave();
      });

      // Los eventos dentro del libro ocurren en un iframe: se reenvían aquí
      rendition.on("keydown", onKey);
      rendition.on("click", (e: MouseEvent) => {
        const view = e.view as Window | null;
        if (view?.getSelection()?.toString()) return; // seleccionando texto
        if ((e.target as Element | null)?.closest?.("a")) return; // enlace interno
        const frame = view?.frameElement;
        if (frame) handleTapAt(frame.getBoundingClientRect().left + e.clientX);
      });
      rendition.on("touchstart", (e: TouchEvent) => {
        const t = e.touches[0];
        touchStart.current = e.touches.length === 1 ? { x: t.screenX, y: t.screenY } : null;
      });
      rendition.on("touchend", (e: TouchEvent) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start) return;
        const t = e.changedTouches[0];
        const swipe = detectSwipe(t.screenX - start.x, t.screenY - start.y);
        if (swipe === "next") next();
        else if (swipe === "prev") prev();
      });

      const nav = await epub.loaded.navigation;
      if (cancelled) return;
      setToc(flattenToc(nav.toc));

      try {
        await rendition.display(book.location || undefined);
      } catch {
        await rendition.display(); // posición guardada no válida: empezar desde el principio
      }
      if (cancelled) return;
      setReady(true);

      // 2. Posiciones para el porcentaje y la barra (se guardan para no recalcular)
      if (book.epubLocations) {
        epub.locations.load(book.epubLocations);
      } else {
        await epub.locations.generate(LOCATION_CHARS);
        if (cancelled) return;
        void saveEpubLocations(book.id, epub.locations.save());
      }
      locationsReadyRef.current = true;
      if (lastCfi.current) {
        const p = epub.locations.percentageFromCfi(lastCfi.current);
        lastProgress.current = p;
        setPercent(p);
      }
    })().catch((err) => {
      console.error(err);
      if (!cancelled) setError("No se pudo abrir el EPUB. Puede que el archivo esté dañado.");
    });

    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
      clearTimeout(saveTimer.current);
      // Guardar la última posición al salir
      if (lastCfi.current) void saveProgress(book.id, lastProgress.current, lastCfi.current);
      epubRef.current?.destroy();
      epubRef.current = null;
      renditionRef.current = null;
    };
    // book.file, book.location y book.epubLocations solo se leen al abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  // 3. Cambios de ajustes: aplicarlos y recordarlos
  const updateSettings = (patch: Partial<EpubSettings>) => {
    setSettings((prevSettings) => {
      const s = { ...prevSettings, ...patch, fontSize: clampFontSize(patch.fontSize ?? prevSettings.fontSize) };
      settingsRef.current = s;
      if (renditionRef.current) applySettings(renditionRef.current, s);
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
      } catch {
        /* sin almacenamiento: los ajustes duran solo esta sesión */
      }
      return s;
    });
  };

  const goTo = (target: string) => {
    setPanel(null);
    void renditionRef.current?.display(target);
  };

  const colors = THEME_COLORS[settings.theme];
  const chapter = chapterLabel(toc, currentHref);
  const btn = "rounded-md px-2.5 py-1.5 text-sm hover:bg-black/10 disabled:opacity-35";
  const bar = `absolute inset-x-0 z-20 flex items-center gap-2 px-3 transition-opacity duration-200 ${
    barsVisible || panel ? "opacity-100" : "pointer-events-none opacity-0"
  }`;

  return (
    <div className="relative h-[100dvh] overflow-hidden" style={{ background: colors.background, color: colors.text }}>
      {/* Barra superior */}
      <header className={`${bar} top-0 h-14`}>
        <Link href="/" className={btn} aria-label="Volver a la biblioteca">
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-medium">{book.title}</h1>
          {chapter && <p className="truncate text-xs opacity-60">{chapter}</p>}
        </div>
        <button type="button" className={btn} onClick={() => setPanel(panel === "toc" ? null : "toc")} aria-label="Índice" disabled={!toc.length}>
          ☰
        </button>
        <button type="button" className={`${btn} font-serif`} onClick={() => setPanel(panel === "settings" ? null : "settings")} aria-label="Ajustes de lectura">
          Aa
        </button>
      </header>

      {/* Libro: se reserva espacio para las barras para que nunca tapen el texto */}
      <div
        className="absolute inset-x-0 bottom-16 top-14 mx-auto max-w-[720px] px-4 sm:px-8"
        onClick={(e) => {
          // Toques en los márgenes (fuera del iframe del libro)
          if (e.target === e.currentTarget) handleTapAt(e.clientX);
        }}
      >
        <div ref={hostRef} className="h-full w-full" />
        {!ready && !error && <p className="absolute inset-0 mt-16 text-center opacity-60">Abriendo…</p>}
        {error && (
          <div className="absolute inset-0 mt-16 px-6 text-center">
            <p className="font-medium">{error}</p>
            <Link href="/" className="mt-4 inline-block underline" style={{ color: colors.link }}>
              Volver a la biblioteca
            </Link>
          </div>
        )}
      </div>

      {/* Barra inferior */}
      <footer className={`${bar} bottom-0 h-16 pb-[env(safe-area-inset-bottom)]`}>
        <button type="button" className={btn} onClick={prev} disabled={!ready || atStart} aria-label="Página anterior">
          ‹
        </button>
        {percent === null ? (
          <p className="flex-1 text-center text-xs opacity-60">{ready ? "Calculando posiciones…" : ""}</p>
        ) : (
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(percent * 1000)}
            onChange={(e) => {
              const p = Number(e.target.value) / 1000;
              setPercent(p);
              const cfi = epubRef.current?.locations.cfiFromPercentage(p);
              if (cfi) void renditionRef.current?.display(cfi);
            }}
            className="flex-1"
            style={{ accentColor: colors.link }}
            aria-label="Posición en el libro"
          />
        )}
        <span className="w-12 text-center text-sm tabular-nums opacity-70">
          {percent === null ? "" : `${Math.round(percent * 100)} %`}
        </span>
        <button type="button" className={btn} onClick={next} disabled={!ready || atEnd} aria-label="Página siguiente">
          ›
        </button>
      </footer>

      {/* Fondo para cerrar paneles */}
      {panel && <button type="button" className="absolute inset-0 z-30 bg-black/30" aria-label="Cerrar" onClick={() => setPanel(null)} />}

      {/* Índice */}
      {panel === "toc" && (
        <nav
          className="absolute inset-y-0 left-0 z-40 w-[85%] max-w-sm overflow-y-auto p-4 shadow-xl"
          style={{ background: colors.background }}
          aria-label="Índice"
        >
          <h2 className="mb-3 font-serif text-lg font-bold">Índice</h2>
          <ul>
            {toc.map((item, i) => {
              const active = item.label === chapter;
              return (
                <li key={`${item.href}-${i}`}>
                  <button
                    type="button"
                    onClick={() => goTo(item.href)}
                    className={`w-full rounded px-2 py-2 text-left text-sm hover:bg-black/10 ${active ? "font-semibold" : ""}`}
                    style={{ paddingLeft: 8 + item.depth * 16, color: active ? colors.link : undefined }}
                  >
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {/* Ajustes */}
      {panel === "settings" && (
        <section
          className="absolute inset-x-0 bottom-0 z-40 mx-auto max-w-lg space-y-5 rounded-t-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl"
          style={{ background: colors.background }}
          aria-label="Ajustes de lectura"
        >
          <div className="flex gap-3">
            {(Object.keys(THEME_COLORS) as EpubTheme[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => updateSettings({ theme: t })}
                className="flex-1 rounded-lg border-2 py-3 text-sm capitalize"
                style={{
                  background: THEME_COLORS[t].background,
                  color: THEME_COLORS[t].text,
                  borderColor: settings.theme === t ? colors.link : "rgba(128,128,128,.3)",
                }}
                aria-pressed={settings.theme === t}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span className="w-24 text-sm opacity-70">Tamaño</span>
            <button type="button" className={`${btn} border border-current/20`} onClick={() => updateSettings({ fontSize: settings.fontSize - FONT_SIZE_STEP })} aria-label="Letra más pequeña">
              A−
            </button>
            <span className="w-14 text-center text-sm tabular-nums">{settings.fontSize} %</span>
            <button type="button" className={`${btn} border border-current/20 text-base`} onClick={() => updateSettings({ fontSize: settings.fontSize + FONT_SIZE_STEP })} aria-label="Letra más grande">
              A+
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="w-24 text-sm opacity-70">Letra</span>
            {(["serif", "sans"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => updateSettings({ font: f })}
                className={`${btn} border`}
                style={{ fontFamily: FONT_STACKS[f], borderColor: settings.font === f ? colors.link : "rgba(128,128,128,.3)" }}
                aria-pressed={settings.font === f}
              >
                {f === "serif" ? "Con remate" : "Sin remate"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span className="w-24 text-sm opacity-70">Interlineado</span>
            {LINE_HEIGHTS.map((lh) => (
              <button
                key={lh}
                type="button"
                onClick={() => updateSettings({ lineHeight: lh })}
                className={`${btn} border tabular-nums`}
                style={{ borderColor: settings.lineHeight === lh ? colors.link : "rgba(128,128,128,.3)" }}
                aria-pressed={settings.lineHeight === lh}
              >
                {lh}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
