import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addAnnotation,
  excerpt,
  hitTest,
  listAnnotations,
  normalizeRects,
  toggleBookmark,
  updateAnnotation,
} from "@/lib/annotations";
import { deleteBook, IrakurriDB } from "@/lib/db";
import type { Annotation } from "@/lib/types";

let database: IrakurriDB;
beforeEach(() => {
  database = new IrakurriDB(`test-${Math.random()}`);
});
afterEach(async () => {
  await database.delete();
});

const highlight = (bookId: string, order: number, text = "texto") =>
  addAnnotation({ bookId, kind: "highlight", location: "1", order, text, color: "amarillo" }, database);

describe("anotaciones", () => {
  it("lista solo las del libro y en orden de lectura", async () => {
    await highlight("A", 0.8, "final");
    await highlight("A", 0.1, "inicio");
    await highlight("B", 0.5, "otro libro");

    expect((await listAnnotations("A", database)).map((a) => a.text)).toEqual(["inicio", "final"]);
  });

  it("guarda notas recortando espacios y elimina la nota si queda vacía", async () => {
    const a = await highlight("A", 0.2);
    await updateAnnotation(a.id, { note: "  idea importante  " }, database);
    expect((await database.annotations.get(a.id))?.note).toBe("idea importante");

    await updateAnnotation(a.id, { note: "   " }, database);
    expect((await database.annotations.get(a.id))?.note).toBeUndefined();
  });

  it("pone y quita un marcador en la misma posición", async () => {
    const data = { bookId: "A", location: "12", order: 0.4, text: "Página 12" };
    const samePage = (b: Annotation) => b.location === "12";

    expect(await toggleBookmark(data, samePage, database)).toBe(true);
    expect((await listAnnotations("A", database)).filter((a) => a.kind === "bookmark")).toHaveLength(1);

    expect(await toggleBookmark(data, samePage, database)).toBe(false);
    expect(await listAnnotations("A", database)).toHaveLength(0);
  });

  it("al borrar un libro se borran también sus anotaciones", async () => {
    await database.books.add({
      id: "A", title: "t", author: "a", format: "pdf", file: new Blob(), size: 0, addedAt: 0, progress: 0,
    });
    await highlight("A", 0.1);
    await highlight("B", 0.1);

    await deleteBook("A", database);

    expect(await listAnnotations("A", database)).toHaveLength(0);
    expect(await listAnnotations("B", database)).toHaveLength(1);
  });
});

describe("normalizeRects", () => {
  const page = { left: 100, top: 50, width: 400, height: 600 };

  it("convierte a fracciones de página y une los trozos de una misma línea", () => {
    const rects = normalizeRects(
      [
        { left: 140, top: 110, width: 100, height: 12 },
        { left: 240, top: 110, width: 60, height: 12 }, // misma línea, contiguo
        { left: 140, top: 130, width: 200, height: 12 }, // línea siguiente
      ],
      page,
    );
    expect(rects).toHaveLength(2);
    expect(rects[0].x).toBeCloseTo(0.1);
    expect(rects[0].w).toBeCloseTo(0.4);
    expect(rects[0].y).toBeCloseTo(0.1);
    expect(rects[1].y).toBeCloseTo(80 / 600);
  });

  it("descarta rectángulos vacíos y recorta lo que sale de la página", () => {
    const rects = normalizeRects(
      [
        { left: 150, top: 60, width: 0, height: 12 },
        { left: 450, top: 60, width: 100, height: 12 },
      ],
      page,
    );
    expect(rects).toHaveLength(1);
    expect(rects[0].x + rects[0].w).toBeCloseTo(1);
  });

  it("no falla con una página sin tamaño", () => {
    expect(normalizeRects([{ left: 0, top: 0, width: 5, height: 5 }], { left: 0, top: 0, width: 0, height: 0 })).toEqual([]);
  });
});

describe("hitTest y excerpt", () => {
  const ann = { id: "1", rects: [{ x: 0.1, y: 0.1, w: 0.3, h: 0.02 }] } as Annotation;

  it("detecta el subrayado bajo el dedo", () => {
    expect(hitTest([ann], 0.2, 0.11)?.id).toBe("1");
    expect(hitTest([ann], 0.5, 0.11)).toBeUndefined();
  });

  it("recorta textos largos y limpia espacios", () => {
    expect(excerpt("hola   \n mundo")).toBe("hola mundo");
    expect(excerpt("a".repeat(300), 10)).toBe(`${"a".repeat(9)}…`);
  });
});
