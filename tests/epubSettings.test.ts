import { describe, expect, it } from "vitest";
import {
  buildThemeRules,
  chapterLabel,
  clampFontSize,
  DEFAULT_EPUB_SETTINGS,
  flattenToc,
  parseSettings,
} from "@/lib/reader/epubSettings";

describe("clampFontSize", () => {
  it("redondea al paso y respeta los límites", () => {
    expect(clampFontSize(114)).toBe(110);
    expect(clampFontSize(10)).toBe(70);
    expect(clampFontSize(999)).toBe(200);
    expect(clampFontSize(Number.NaN)).toBe(100);
  });
});

describe("parseSettings", () => {
  it("devuelve los valores por defecto si no hay nada o el JSON está roto", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_EPUB_SETTINGS);
    expect(parseSettings("{roto")).toEqual(DEFAULT_EPUB_SETTINGS);
  });

  it("conserva los campos válidos y corrige los inválidos uno a uno", () => {
    const s = parseSettings(JSON.stringify({ theme: "sepia", font: "comic", fontSize: 135, lineHeight: 9 }));
    expect(s).toEqual({ theme: "sepia", font: "serif", fontSize: 140, lineHeight: 1.5 });
  });

  it("no acepta propiedades heredadas como tema", () => {
    expect(parseSettings(JSON.stringify({ theme: "toString" })).theme).toBe("claro");
  });
});

describe("índice", () => {
  const toc = flattenToc([
    { href: "Text/cap1.xhtml", label: " Capítulo 1 " },
    {
      href: "Text/cap2.xhtml",
      label: "Capítulo 2",
      subitems: [{ href: "Text/cap2.xhtml#s1", label: "2.1 Sección" }],
    },
  ]);

  it("aplana el índice anidado indicando la profundidad", () => {
    expect(toc).toEqual([
      { href: "Text/cap1.xhtml", label: "Capítulo 1", depth: 0 },
      { href: "Text/cap2.xhtml", label: "Capítulo 2", depth: 0 },
      { href: "Text/cap2.xhtml#s1", label: "2.1 Sección", depth: 1 },
    ]);
  });

  it("encuentra el capítulo actual aunque cambie el prefijo de carpeta", () => {
    expect(chapterLabel(toc, "OEBPS/Text/cap2.xhtml")).toBe("Capítulo 2");
    expect(chapterLabel(toc, "Text/cap1.xhtml")).toBe("Capítulo 1");
    expect(chapterLabel(toc, "otro.xhtml")).toBeUndefined();
    expect(chapterLabel(toc, undefined)).toBeUndefined();
  });
});

describe("buildThemeRules", () => {
  const rules = buildThemeRules(DEFAULT_EPUB_SETTINGS);
  const ruleFor = (tag: string) =>
    Object.entries(rules).find(([selector]) => selector.split(",").map((x) => x.trim()).includes(tag))?.[1];

  it("hace que el texto corriente herede el tamaño del lector aunque el libro lo fije en pt", () => {
    for (const tag of ["p", "span", "li", "div", "td"]) {
      expect(ruleFor(tag)?.["font-size"]).toBe("inherit !important");
    }
  });

  it("mantiene la jerarquía de los títulos en proporción al texto", () => {
    expect(rules.h1["font-size"]).toBe("1.6em !important");
    expect(rules.h2["font-size"]).toBe("1.4em !important");
    expect(rules["h1 *"]["font-size"]).toBe("inherit !important");
  });

  it("aplica colores y tipo de letra del tema elegido", () => {
    const sepia = buildThemeRules({ ...DEFAULT_EPUB_SETTINGS, theme: "sepia", font: "sans" });
    expect(sepia.body.background).toContain("#f4ecd8");
    expect(sepia.body["font-family"]).toContain("system-ui");
    expect(sepia.html["font-size"]).toBe("100% !important");
  });
});
