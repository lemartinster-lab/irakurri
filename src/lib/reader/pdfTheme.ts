import { THEME_COLORS, type EpubTheme } from "./epubSettings";

/** Los PDF usan los mismos tres temas que los EPUB. */
export type PdfTheme = EpubTheme;

export const PDF_THEME_KEY = "irakurri:pdf-theme";
/** Preferencia antigua (fase 2): modo noche sí/no. Se migra a "oscuro". */
export const LEGACY_NIGHT_KEY = "irakurri:pdf-night";

interface StorageLike {
  getItem(key: string): string | null;
}

export function readPdfTheme(storage: StorageLike | undefined): PdfTheme {
  try {
    const saved = storage?.getItem(PDF_THEME_KEY);
    if (saved && Object.hasOwn(THEME_COLORS, saved)) return saved as PdfTheme;
    if (storage?.getItem(LEGACY_NIGHT_KEY) === "1") return "oscuro";
  } catch {
    /* almacenamiento no disponible */
  }
  return "claro";
}

/**
 * Cómo se pinta la página del PDF (que es una imagen) en cada tema:
 * - oscuro: se invierten los colores y se corrige el tono para que las fotos no queden azules
 * - sepia: una capa color papel en modo "multiplicar": el blanco pasa a sepia y el negro sigue negro
 */
export function pdfPageStyle(theme: PdfTheme): {
  filter?: string;
  overlay?: { background: string; mixBlendMode: "multiply" };
  highlightBlend: "multiply" | "normal";
  highlightOpacity: number;
} {
  switch (theme) {
    case "oscuro":
      return { filter: "invert(0.9) hue-rotate(180deg)", highlightBlend: "normal", highlightOpacity: 0.35 };
    case "sepia":
      return {
        overlay: { background: THEME_COLORS.sepia.background, mixBlendMode: "multiply" },
        highlightBlend: "multiply",
        highlightOpacity: 0.4,
      };
    default:
      return { highlightBlend: "multiply", highlightOpacity: 0.4 };
  }
}
