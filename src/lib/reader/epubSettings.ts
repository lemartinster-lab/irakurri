/**
 * Ajustes de lectura de EPUB y utilidades puras (probadas sin navegador).
 */

export type EpubTheme = "claro" | "sepia" | "oscuro";
export type EpubFont = "serif" | "sans";

export interface EpubSettings {
  theme: EpubTheme;
  font: EpubFont;
  /** Tamaño de letra en % respecto al del libro */
  fontSize: number;
  /** Interlineado */
  lineHeight: number;
}

export const DEFAULT_EPUB_SETTINGS: EpubSettings = {
  theme: "claro",
  font: "serif",
  fontSize: 100,
  lineHeight: 1.5,
};

export const FONT_SIZE_MIN = 70;
export const FONT_SIZE_MAX = 200;
export const FONT_SIZE_STEP = 10;
export const LINE_HEIGHTS = [1.3, 1.5, 1.8] as const;

export const THEME_COLORS: Record<EpubTheme, { background: string; text: string; link: string }> = {
  claro: { background: "#ffffff", text: "#1f1d1a", link: "#b5452f" },
  sepia: { background: "#f4ecd8", text: "#5b4636", link: "#9c4a2f" },
  oscuro: { background: "#16161a", text: "#d9d6d0", link: "#e0745c" },
};

export const FONT_STACKS: Record<EpubFont, string> = {
  serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

export function clampFontSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_EPUB_SETTINGS.fontSize;
  const stepped = Math.round(size / FONT_SIZE_STEP) * FONT_SIZE_STEP;
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, stepped));
}

/**
 * Lee los ajustes guardados tolerando valores corruptos o de versiones antiguas:
 * cada campo inválido se sustituye por su valor por defecto.
 */
export function parseSettings(raw: string | null | undefined): EpubSettings {
  let data: Partial<Record<keyof EpubSettings, unknown>> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") data = parsed as typeof data;
  } catch {
    /* JSON corrupto: se usan los valores por defecto */
  }
  const d = DEFAULT_EPUB_SETTINGS;
  return {
    theme: typeof data.theme === "string" && Object.hasOwn(THEME_COLORS, data.theme) ? (data.theme as EpubTheme) : d.theme,
    font: data.font === "serif" || data.font === "sans" ? data.font : d.font,
    fontSize: typeof data.fontSize === "number" ? clampFontSize(data.fontSize) : d.fontSize,
    lineHeight:
      typeof data.lineHeight === "number" && (LINE_HEIGHTS as readonly number[]).includes(data.lineHeight)
        ? data.lineHeight
        : d.lineHeight,
  };
}

export interface TocItem {
  href: string;
  label: string;
  subitems?: TocItem[];
}

export interface FlatTocItem {
  href: string;
  label: string;
  depth: number;
}

/** Aplana el índice anidado para mostrarlo como lista con sangría. */
export function flattenToc(items: TocItem[], depth = 0): FlatTocItem[] {
  return items.flatMap((item) => [
    { href: item.href, label: item.label.trim(), depth },
    ...flattenToc(item.subitems ?? [], depth + 1),
  ]);
}

/** Compara rutas de capítulo ignorando el ancla (#...) y prefijos de carpeta. */
function samePath(a: string, b: string): boolean {
  const clean = (s: string) => decodeURIComponent(s.split("#")[0]).replace(/^(\.\/|\/)+/, "");
  const ca = clean(a);
  const cb = clean(b);
  return ca === cb || ca.endsWith(`/${cb}`) || cb.endsWith(`/${ca}`);
}

/** Título del capítulo en curso a partir del archivo que se está mostrando. */
export function chapterLabel(toc: FlatTocItem[], currentHref: string | undefined): string | undefined {
  if (!currentHref) return undefined;
  return toc.find((item) => samePath(item.href, currentHref))?.label;
}
