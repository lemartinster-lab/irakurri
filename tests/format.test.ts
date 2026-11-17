import { describe, expect, it } from "vitest";
import { cleanAuthor, detectFormat, formatProgress, formatSize, titleFromFilename } from "@/lib/format";

describe("detectFormat", () => {
  it("usa el tipo MIME cuando existe", () => {
    expect(detectFormat({ name: "x.bin", type: "application/pdf" })).toBe("pdf");
    expect(detectFormat({ name: "x", type: "application/epub+zip" })).toBe("epub");
  });

  it("recurre a la extensión si el MIME falta (caso típico de Android)", () => {
    expect(detectFormat({ name: "Novela.EPUB", type: "" })).toBe("epub");
    expect(detectFormat({ name: "informe.pdf" })).toBe("pdf");
  });

  it("rechaza formatos no compatibles", () => {
    expect(detectFormat({ name: "libro.mobi", type: "" })).toBeNull();
    expect(detectFormat({ name: "foto.jpg", type: "image/jpeg" })).toBeNull();
  });
});

describe("titleFromFilename", () => {
  it("limpia guiones, barras bajas y extensión", () => {
    expect(titleFromFilename("el_nombre-de_la-rosa.pdf")).toBe("el nombre de la rosa");
  });
  it("devuelve un título de reserva si queda vacío", () => {
    expect(titleFromFilename("___.epub")).toBe("Sin título");
  });
});

describe("cleanAuthor", () => {
  it("descarta autores de relleno y conserva los reales", () => {
    expect(cleanAuthor("anonymous")).toBe("Autor desconocido");
    expect(cleanAuthor("  ")).toBe("Autor desconocido");
    expect(cleanAuthor(undefined)).toBe("Autor desconocido");
    expect(cleanAuthor(" Bernardo Atxaga ")).toBe("Bernardo Atxaga");
  });
});

describe("formatProgress / formatSize", () => {
  it("acota el progreso entre 0 y 100 %", () => {
    expect(formatProgress(0.426)).toBe("43 %");
    expect(formatProgress(1.5)).toBe("100 %");
    expect(formatProgress(-1)).toBe("0 %");
    expect(formatProgress(Number.NaN)).toBe("0 %");
  });
  it("formatea tamaños legibles", () => {
    expect(formatSize(500)).toBe("500 B");
    expect(formatSize(2048)).toBe("2 KB");
    expect(formatSize(3.5 * 1024 * 1024)).toBe("3.5 MB");
  });
});
