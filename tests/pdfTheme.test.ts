import { describe, expect, it } from "vitest";
import { LEGACY_NIGHT_KEY, PDF_THEME_KEY, pdfPageStyle, readPdfTheme } from "@/lib/reader/pdfTheme";

const storage = (data: Record<string, string>) => ({ getItem: (k: string) => data[k] ?? null });

describe("readPdfTheme", () => {
  it("usa el tema guardado", () => {
    expect(readPdfTheme(storage({ [PDF_THEME_KEY]: "sepia" }))).toBe("sepia");
  });

  it("convierte el antiguo modo noche en el tema oscuro", () => {
    expect(readPdfTheme(storage({ [LEGACY_NIGHT_KEY]: "1" }))).toBe("oscuro");
    expect(readPdfTheme(storage({ [LEGACY_NIGHT_KEY]: "0" }))).toBe("claro");
  });

  it("el tema nuevo manda sobre el modo noche antiguo", () => {
    expect(readPdfTheme(storage({ [PDF_THEME_KEY]: "claro", [LEGACY_NIGHT_KEY]: "1" }))).toBe("claro");
  });

  it("ignora valores inválidos o un almacenamiento que falla", () => {
    expect(readPdfTheme(storage({ [PDF_THEME_KEY]: "toString" }))).toBe("claro");
    expect(readPdfTheme(undefined)).toBe("claro");
    expect(readPdfTheme({ getItem: () => { throw new Error("bloqueado"); } })).toBe("claro");
  });
});

describe("pdfPageStyle", () => {
  it("claro no altera la página", () => {
    expect(pdfPageStyle("claro")).toEqual({ highlightBlend: "multiply", highlightOpacity: 0.4 });
  });

  it("sepia tiñe el papel sin aclarar el texto (multiplicar)", () => {
    const s = pdfPageStyle("sepia");
    expect(s.filter).toBeUndefined();
    expect(s.overlay).toEqual({ background: "#f4ecd8", mixBlendMode: "multiply" });
  });

  it("oscuro invierte la página y no multiplica los subrayados", () => {
    const s = pdfPageStyle("oscuro");
    expect(s.filter).toContain("invert");
    expect(s.highlightBlend).toBe("normal");
  });
});
