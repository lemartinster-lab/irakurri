import { describe, expect, it } from "vitest";
import { annotationsToMarkdown, exportFileName } from "@/lib/exportNotes";
import type { Annotation } from "@/lib/types";

const base = { bookId: "b", createdAt: 0 } as const;
const annotations: Annotation[] = [
  { ...base, id: "3", kind: "highlight", location: "12", order: 0.6, text: "Ni etorri naiz.\nZu joan zara.", color: "verde", note: "  Verbos intransitivos  " },
  { ...base, id: "1", kind: "bookmark", location: "3", order: 0.1, text: "Página 3" },
  { ...base, id: "2", kind: "highlight", location: "5", order: 0.3, text: "Kaixo, zer moduz?" },
];
const label = (a: Annotation) => `Pág. ${a.location}`;
const date = new Date(2026, 10, 17);

describe("annotationsToMarkdown", () => {
  const md = annotationsToMarkdown({ title: "Curso de Euskera", author: "Lemarrero" }, annotations, label, date);

  it("incluye título, autor, fecha y recuento", () => {
    expect(md).toContain("# Curso de Euskera");
    expect(md).toContain("*Lemarrero* · Notas exportadas de Irakurri el 17 de noviembre de 2026");
    expect(md).toContain("2 subrayados · 1 nota · 1 marcador");
  });

  it("ordena por posición en el libro", () => {
    const order = ["Página 3", "Kaixo, zer moduz?", "Ni etorri naiz."].map((t) => md.indexOf(t));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("cita cada línea del subrayado, indica color y recorta la nota", () => {
    expect(md).toContain("**Subrayado** (verde) · Pág. 12\n\n> Ni etorri naiz.\n> Zu joan zara.");
    expect(md).toContain("**Nota:** Verbos intransitivos\n");
    expect(md).toContain("**Subrayado** (amarillo) · Pág. 5");
    expect(md).toContain("**🔖 Marcador** · Pág. 3");
  });

  it("avisa cuando no hay nada que exportar", () => {
    const empty = annotationsToMarkdown({ title: "T", author: "A" }, [], label, date);
    expect(empty).toContain("0 subrayados · 0 notas · 0 marcadores");
    expect(empty).toContain("todavía no tiene subrayados");
  });
});

describe("exportFileName", () => {
  it("quita tildes y símbolos y añade la extensión", () => {
    expect(exportFileName("Curso de Euskera: módulo 1 (A1/A2)")).toBe("Curso-de-Euskera-modulo-1-A1A2-notas.md");
    expect(exportFileName("¿?", "txt")).toBe("libro-notas.txt");
  });
});

describe("exportPlan", () => {
  it("en el ordenador descarga el archivo", async () => {
    const { exportPlan } = await import("@/lib/exportNotes");
    expect(exportPlan({ mobile: false, canShareFiles: true, canShareText: true, hasClipboard: true })).toEqual(["download"]);
  });

  it("en el móvil prefiere compartir el archivo y luego el texto", async () => {
    const { exportPlan } = await import("@/lib/exportNotes");
    expect(exportPlan({ mobile: true, canShareFiles: true, canShareText: true, hasClipboard: true })).toEqual([
      "share-file", "share-text", "clipboard", "download",
    ]);
  });

  it("si el navegador no comparte archivos (DuckDuckGo) comparte como texto", async () => {
    const { exportPlan } = await import("@/lib/exportNotes");
    expect(exportPlan({ mobile: true, canShareFiles: false, canShareText: true, hasClipboard: true })[0]).toBe("share-text");
  });

  it("sin compartir, copia al portapapeles antes de descargar", async () => {
    const { exportPlan } = await import("@/lib/exportNotes");
    expect(exportPlan({ mobile: true, canShareFiles: false, canShareText: false, hasClipboard: true })).toEqual(["clipboard", "download"]);
  });
});
