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
export const LINE_HEIGHT_LABELS: Record<(typeof LINE_HEIGHTS)[number], string> = {
  1.3: "Estrecho",
  1.5: "Normal",
  1.8: "Amplio",
};

export const THEME_COLORS: Record<EpubTheme, { background: string; text: string; link: string }> = {
  claro: { background: "#ffffff", text: "#1f1d1a", link: "#b5452f" },
  sepia: { background: "#f4ecd8", text: "#5b4636", link: "#9c4a2f" },
  oscuro: { background: "#16161a", text: "#d9d6d0", link: "#e0745c" },
};

export const FONT_LABELS: Record<EpubFont, string> = { serif: "Clásica", sans: "Moderna" };

export const FONT_STACKS: Record<EpubFont, string> = {
  serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

/** Tamaño de los títulos respecto al texto normal (se mantiene la jerarquía al escalar). */
export const HEADING_SCALE = { h1: 1.6, h2: 1.4, h3: 1.2, h4: 1.1, h5: 1, h6: 1 } as const;

/** Elementos de texto corriente: siempre heredan el tamaño elegido por el lector. */
const TEXT_ELEMENTS = "p, li, span, div, blockquote, td, th, dd, dt, a, em, strong, b, i, u, font, section, article";

/**
 * Reglas CSS que se inyectan en el libro según los ajustes.
 * Muchos EPUB (sobre todo los exportados de Google Docs o Word) fijan el tamaño de
 * cada párrafo en pt o px; un tamaño fijo no hereda el del cuerpo y el ajuste de
 * tamaño no tendría efecto. Por eso, como hacen los lectores tipo Kindle, el texto
 * corriente hereda siempre el tamaño del lector y los títulos usan proporciones
 * fijas sobre él. El tamaño en sí (%) se aplica aparte con themes.fontSize().
 */
export function buildThemeRules(s: EpubSettings): Record<string, Record<string, string>> {
  const c = THEME_COLORS[s.theme];
  const rules: Record<string, Record<string, string>> = {
    // Base conocida para el porcentaje (algunos libros cambian el tamaño de <html>)
    html: { "font-size": "100% !important" },
    body: {
      background: `${c.background} !important`,
      color: `${c.text} !important`,
      "font-family": `${FONT_STACKS[s.font]} !important`,
      "line-height": `${s.lineHeight} !important`,
    },
    [TEXT_ELEMENTS]: {
      color: "inherit !important",
      "font-family": "inherit !important",
      "line-height": "inherit !important",
      "font-size": "inherit !important",
    },
    a: { color: `${c.link} !important` },
  };
  for (const [tag, scale] of Object.entries(HEADING_SCALE)) {
    rules[tag] = {
      color: "inherit !important",
      "font-family": "inherit !important",
      "line-height": "1.25 !important",
      "font-size": `${scale}em !important`,
    };
    // Lo que va dentro de un título hereda el tamaño del título, no el del texto normal
    rules[`${tag} *`] = { "font-size": "inherit !important" };
  }
  return rules;
}

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
