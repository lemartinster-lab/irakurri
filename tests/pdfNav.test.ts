import { describe, expect, it } from "vitest";
import {
  clampPage,
  detectSwipe,
  fitScale,
  pageFromLocation,
  pageProgress,
  zoomIn,
  zoomOut,
} from "@/lib/reader/pdfNav";

describe("páginas", () => {
  it("acota la página al rango del documento", () => {
    expect(clampPage(0, 10)).toBe(1);
    expect(clampPage(11, 10)).toBe(10);
    expect(clampPage(4.6, 10)).toBe(5);
    expect(clampPage(Number.NaN, 10)).toBe(1);
  });

  it("calcula el progreso y marca la última página como terminado", () => {
    expect(pageProgress(5, 10)).toBe(0.5);
    expect(pageProgress(10, 10)).toBe(1);
    expect(pageProgress(1, 0)).toBe(0);
  });

  it("restaura la posición guardada o empieza en la 1", () => {
    expect(pageFromLocation("37", 120)).toBe(37);
    expect(pageFromLocation(undefined, 120)).toBe(1);
    expect(pageFromLocation("basura", 120)).toBe(1);
    expect(pageFromLocation("500", 120)).toBe(120); // el PDF se reemplazó por uno más corto
  });
});

describe("zoom", () => {
  it("ajusta a la anchura sin superar el máximo en escritorio", () => {
    expect(fitScale(400, 600)).toBeCloseTo(400 / 600);
    expect(fitScale(1600, 600)).toBeCloseTo(900 / 600);
    expect(fitScale(0, 600)).toBe(1);
  });

  it("recorre los niveles de zoom y se detiene en los extremos", () => {
    expect(zoomIn(1)).toBe(1.25);
    expect(zoomOut(1)).toBe(0.75);
    expect(zoomIn(3)).toBe(3);
    expect(zoomOut(0.5)).toBe(0.5);
  });
});

describe("detectSwipe", () => {
  it("deslizar a la izquierda avanza y a la derecha retrocede", () => {
    expect(detectSwipe(-120, 10)).toBe("next");
    expect(detectSwipe(120, -5)).toBe("prev");
  });

  it("ignora toques cortos y desplazamientos verticales", () => {
    expect(detectSwipe(-20, 0)).toBeNull();
    expect(detectSwipe(-80, 200)).toBeNull();
  });
});
