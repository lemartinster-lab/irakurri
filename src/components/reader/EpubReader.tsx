"use client";

import type { Contents, Book as EpubBook, EpubCFI, Location, Rendition } from "epubjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_SECTION_CHARS } from "@/lib/ai/prompts";
import { addAnnotation, HIGHLIGHT_COLORS, toggleBookmark, type NewAnnotation } from "@/lib/annotations";
import { markOpened, saveEpubLocations, saveProgress } from "@/lib/db";
import {
  chapterLabel,
  clampFontSize,
  FONT_SIZE_STEP,
  buildThemeRules,
  FONT_LABELS,
  FONT_STACKS,
  flattenToc,
  LINE_HEIGHT_LABELS,
  LINE_HEIGHTS,
  parseSettings,
  THEME_COLORS,
  type EpubSettings,
  type EpubTheme,
  type FlatTocItem,
} from "@/lib/reader/epubSettings";
import { detectSwipe } from "@/lib/reader/pdfNav";
import type { Annotation, Book, HighlightColor } from "@/lib/types";
import {
  AnnotationEditor,
  AnnotationsList,
  BookmarkIcon,
  SelectionToolbar,
  SidePanel,
  useAnnotations,
  type SelectionAiAction,
} from "./annotations";
import { AiSheet } from "./AiSheet";
import { ReaderTitle } from "./ReaderTitle";
import type { AiState } from "./PdfReader";

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
  // v2: el nombre cambia si cambian las reglas, para que epub.js no reutilice las viejas
  const name = `irk2-${s.theme}-${s.font}-${String(s.lineHeight).replace(".", "_")}`;
  rendition.themes.register(name, buildThemeRules(s));
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
  const [panel, setPanel] = useState<null | "toc" | "settings" | "notes">(null);
  const [barsVisible, setBarsVisible] = useState(true);
  const [visibleRange, setVisibleRange] = useState<{ start: string; end: string } | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [editing, setEditing] = useState<Annotation | null>(null);
  const [ai, setAi] = useState<AiState | null>(null);
  const sectionIndexRef = useRef(0);

  const annotations = useAnnotations(book.id);
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const cfiRef = useRef<EpubCFI | null>(null);
  const pendingSelection = useRef<{ cfiRange: string; contents: Contents } | null>(null);
  /** Subrayados ya dibujados en epub.js: id → datos con los que se dibujó */
  const drawn = useRef(new Map<string, { cfi: string; color?: HighlightColor; theme: EpubTheme }>());

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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") next();
      else if (e.key === "ArrowLeft" || e.key === "PageUp") prev();
    };

    (async () => {
      const { default: ePub, EpubCFI: CFI } = await import("epubjs");
      const epub = ePub(await book.file.arrayBuffer());
      if (cancelled || !hostRef.current) return epub.destroy();
      epubRef.current = epub;
      cfiRef.current = new CFI();

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
        setVisibleRange({ start: loc.start.cfi, end: loc.end.cfi });
        setCurrentHref(loc.start.href);
        sectionIndexRef.current = loc.start.index;
        setAtStart(loc.atStart);
        setAtEnd(loc.atEnd);
        if (locationsReadyRef.current) {
          const p = loc.atEnd ? 1 : epub.locations.percentageFromCfi(loc.start.cfi);
          lastProgress.current = p;
          setPercent(p);
        }
        scheduleSave();
      });

      // Selección de texto para subrayar
      rendition.on("selected", (cfiRange: string, contents: Contents) => {
        pendingSelection.current = { cfiRange, contents };
        setHasSelection(true);
      });
      rendition.hooks.content.register((contents: Contents) => {
        contents.document.addEventListener("selectionchange", () => {
          const sel = contents.window.getSelection();
          if (!sel || sel.isCollapsed) {
            pendingSelection.current = null;
            setHasSelection(false);
          }
        });
      });

      // Los eventos dentro del libro ocurren en un iframe: se reenvían aquí
      rendition.on("keydown", onKey);
      rendition.on("click", (e: MouseEvent) => {
        const view = e.view as Window | null;
        if (view?.getSelection()?.toString()) return; // seleccionando texto
        if ((e.target as Element | null)?.closest?.("a")) return; // enlace interno
        const frame = view?.frameElement;
        if (!frame) return;
        const fr = frame.getBoundingClientRect();
        const x = fr.left + e.clientX;
        const y = fr.top + e.clientY;
        // Toque sobre un subrayado: lo gestiona epub.js (abre el editor), no es navegación
        const onHighlight = Array.from(document.querySelectorAll("g.irk-highlight rect")).some((r) => {
          const b = r.getBoundingClientRect();
          return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
        });
        if (!onHighlight) handleTapAt(x);
      });
      rendition.on("touchstart", (e: TouchEvent) => {
        const t = e.touches[0];
        touchStart.current = e.touches.length === 1 ? { x: t.screenX, y: t.screenY } : null;
      });
      rendition.on("touchend", (e: TouchEvent) => {
        const start = touchStart.current;
        touchStart.current = null;
        // Al seleccionar texto el dedo también se desplaza: no es un paso de página
        if (!start || (e.view as Window | null)?.getSelection()?.toString()) return;
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

  // 4. Dibujar los subrayados guardados (y redibujar si cambian de color o de tema)
  const theme = settings.theme;
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!ready || !rendition) return;
    const wanted = new Map(annotations.filter((a) => a.kind === "highlight").map((a) => [a.id, a]));

    for (const [id, d] of drawn.current) {
      const a = wanted.get(id);
      if (!a || a.color !== d.color || d.theme !== theme) {
        rendition.annotations.remove(d.cfi, "highlight");
        drawn.current.delete(id);
      }
    }
    for (const a of wanted.values()) {
      if (drawn.current.has(a.id)) continue;
      rendition.annotations.highlight(
        a.location,
        { id: a.id },
        () => setEditing(annotationsRef.current.find((x) => x.id === a.id) ?? null),
        "irk-highlight",
        {
          fill: HIGHLIGHT_COLORS[a.color ?? "amarillo"].fill,
          "fill-opacity": theme === "oscuro" ? "0.3" : "0.4",
          "mix-blend-mode": theme === "oscuro" ? "normal" : "multiply",
        },
      );
      drawn.current.set(a.id, { cfi: a.location, color: a.color, theme });
    }
  }, [annotations, ready, theme]);

  /** Lee la selección actual (texto y rango CFI) y la borra de la pantalla. */
  const captureSelection = (): Omit<NewAnnotation, "kind"> | null => {
    const pending = pendingSelection.current;
    const rendition = renditionRef.current;
    if (!pending || !rendition) return null;
    const text = rendition.getRange(pending.cfiRange)?.toString().trim() ?? "";
    pending.contents.window.getSelection()?.removeAllRanges();
    pendingSelection.current = null;
    setHasSelection(false);
    if (!text) return null;
    const order = locationsReadyRef.current
      ? epubRef.current!.locations.percentageFromCfi(pending.cfiRange)
      : lastProgress.current;
    return {
      bookId: book.id,
      location: pending.cfiRange,
      order: Number.isFinite(order) ? order : lastProgress.current,
      text,
    };
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

  /** Resume el capítulo que se está leyendo (todo el archivo del capítulo, no solo la pantalla). */
  const summarizeChapter = () => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    setPanel(null);
    // getContents devuelve en realidad una lista (los tipos de epub.js no lo reflejan)
    const all = [rendition.getContents()].flat() as unknown as Contents[];
    const current = all.find((c) => c.sectionIndex === sectionIndexRef.current) ?? all[0];
    const text = (current?.document.body?.innerText || current?.document.body?.textContent || "").trim();
    if (!text) {
      window.alert("Este capítulo no tiene texto que resumir.");
      return;
    }
    setAi({
      request: { action: "resumir-seccion", text: text.slice(0, MAX_SECTION_CHARS), title: book.title, author: book.author },
      heading: chapter ? `Resumen: ${chapter}` : "Resumen del capítulo",
    });
  };

  /** ¿La posición `cfi` está en la pantalla que se ve ahora? */
  const isVisible = (cfi: string) => {
    const c = cfiRef.current;
    if (!c || !visibleRange) return false;
    try {
      return c.compare(visibleRange.start, cfi) <= 0 && c.compare(cfi, visibleRange.end) <= 0;
    } catch {
      return false;
    }
  };
  const bookmarked = annotations.some((a) => a.kind === "bookmark" && isVisible(a.location));

  const colors = THEME_COLORS[settings.theme];
  const palette = { background: colors.background, text: colors.text, accent: colors.link };
  const chapter = chapterLabel(toc, currentHref);

  const onToggleBookmark = () => {
    if (!visibleRange) return;
    const pct = Math.round(lastProgress.current * 100);
    void toggleBookmark(
      { bookId: book.id, location: visibleRange.start, order: lastProgress.current, text: `${chapter ?? "Marcador"} · ${pct} %` },
      (b) => isVisible(b.location),
    );
  };
  const label = "mb-2 text-xs font-medium uppercase tracking-wide opacity-60";
  const option = "min-w-0 rounded-lg border px-1.5 py-2.5 text-sm";
  const optionStyle = (active: boolean) => ({ borderColor: active ? colors.link : "rgba(128,128,128,.3)", borderWidth: active ? 2 : 1 });
  const btn = "shrink-0 rounded-md px-2 py-1.5 text-sm hover:bg-black/10 disabled:opacity-35";
  const bar = `absolute inset-x-0 z-20 flex items-center gap-1 px-2 transition-opacity duration-200 ${
    barsVisible || panel ? "opacity-100" : "pointer-events-none opacity-0"
  }`;

  return (
    <div className="relative h-[100dvh] overflow-hidden" style={{ background: colors.background, color: colors.text }}>
      {/* Barra superior */}
      <header className={`${bar} top-0 h-14`}>
        <a href="/" className={btn} aria-label="Volver a la biblioteca">
          ←
        </a>
        <ReaderTitle title={book.title} author={book.author} subtitle={chapter} palette={palette} />
        <button
          type="button"
          className={btn}
          onClick={onToggleBookmark}
          disabled={!visibleRange}
          aria-pressed={bookmarked}
          aria-label={bookmarked ? "Quitar marcador" : "Añadir marcador"}
          style={bookmarked ? { color: colors.link } : undefined}
        >
          <BookmarkIcon filled={bookmarked} />
        </button>
        <button type="button" className={btn} onClick={summarizeChapter} disabled={!ready} aria-label="Resumir este capítulo con IA">
          ✨
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => setPanel(panel === "toc" || panel === "notes" ? null : toc.length ? "toc" : "notes")}
          aria-label="Índice y notas"
        >
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
            <a href="/" className="mt-4 inline-block underline" style={{ color: colors.link }}>
              Volver a la biblioteca
            </a>
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

      {ai && (
        <AiSheet
          request={ai.request}
          heading={ai.heading}
          palette={palette}
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

      {hasSelection && !editing && !ai && (
        <SelectionToolbar
          palette={palette}
          onHighlight={(c, withNote) => void createHighlight(c, withNote)}
          onAi={askAboutSelection}
          onCancel={() => {
            pendingSelection.current?.contents.window.getSelection()?.removeAllRanges();
            pendingSelection.current = null;
            setHasSelection(false);
          }}
        />
      )}

      {editing && <AnnotationEditor key={editing.id} annotation={editing} palette={palette} onClose={() => setEditing(null)} />}

      {/* Índice y notas: un solo panel con pestañas para no recargar la cabecera */}
      {(panel === "toc" || panel === "notes") && (
        <SidePanel
          side="left"
          tabs={[
            ["toc", "Índice"],
            ["notes", annotations.length ? `Notas (${annotations.length})` : "Notas"],
          ] as const}
          activeTab={panel}
          onTab={setPanel}
          palette={palette}
          onClose={() => setPanel(null)}
        >
          {panel === "toc" ? (
            <ul className="flex-1 overflow-y-auto px-2 pb-6">
              {toc.length === 0 && <li className="px-3 py-8 text-center text-sm opacity-60">Este libro no tiene índice.</li>}
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
          ) : (
            <AnnotationsList
              annotations={annotations}
              palette={palette}
              locationLabel={(a) => `${Math.round(a.order * 100)} %`}
              onGo={(a) => goTo(a.location)}
              onEdit={(a) => {
                setPanel(null);
                setEditing(a);
              }}
            />
          )}
        </SidePanel>
      )}

      {/* Fondo para cerrar los ajustes */}
      {panel === "settings" && (
        <button type="button" className="absolute inset-0 z-30 bg-black/30" aria-label="Cerrar" onClick={() => setPanel(null)} />
      )}

      {/* Ajustes */}
      {panel === "settings" && (
        <section
          className="absolute inset-x-0 bottom-0 z-40 mx-auto max-h-[85dvh] max-w-lg space-y-5 overflow-y-auto rounded-t-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl"
          style={{ background: colors.background }}
          aria-label="Ajustes de lectura"
        >
          <header className="-mb-1 flex items-center justify-between">
            <h2 className="font-serif text-lg font-bold">Ajustes de lectura</h2>
            <button type="button" className={btn} onClick={() => setPanel(null)} aria-label="Cerrar ajustes">
              ✕
            </button>
          </header>
          <div className="flex gap-3">
            {(Object.keys(THEME_COLORS) as EpubTheme[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => updateSettings({ theme: t })}
                className="min-w-0 flex-1 rounded-lg border-2 px-1 py-3 text-sm capitalize"
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

          <div>
            <p className={label}>Tamaño de letra</p>
            <div className="flex items-center gap-3">
              <button type="button" className={`${option} w-16`} style={optionStyle(false)} onClick={() => updateSettings({ fontSize: settings.fontSize - FONT_SIZE_STEP })} aria-label="Letra más pequeña">
                A−
              </button>
              <span className="flex-1 text-center tabular-nums">{settings.fontSize} %</span>
              <button type="button" className={`${option} w-16 text-lg`} style={optionStyle(false)} onClick={() => updateSettings({ fontSize: settings.fontSize + FONT_SIZE_STEP })} aria-label="Letra más grande">
                A+
              </button>
            </div>
          </div>

          <div>
            <p className={label}>Tipo de letra</p>
            <div className="grid grid-cols-2 gap-2">
              {(["serif", "sans"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => updateSettings({ font: f })}
                  className={option}
                  style={{ ...optionStyle(settings.font === f), fontFamily: FONT_STACKS[f] }}
                  aria-pressed={settings.font === f}
                >
                  {FONT_LABELS[f]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className={label}>Interlineado</p>
            <div className="grid grid-cols-3 gap-2">
              {LINE_HEIGHTS.map((lh) => (
                <button
                  key={lh}
                  type="button"
                  onClick={() => updateSettings({ lineHeight: lh })}
                  className={option}
                  style={optionStyle(settings.lineHeight === lh)}
                  aria-pressed={settings.lineHeight === lh}
                >
                  {LINE_HEIGHT_LABELS[lh]}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
