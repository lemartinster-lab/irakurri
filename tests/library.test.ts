import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteBook, IrakurriDB, listBooks, saveProgress, updateBookInfo } from "@/lib/db";
import { importFiles, type Extractors } from "@/lib/import";

let database: IrakurriDB;

beforeEach(() => {
  database = new IrakurriDB(`test-${Math.random()}`);
});

afterEach(async () => {
  await database.delete();
});

const fakeFile = (name: string, type = "") => new File(["contenido"], name, { type });

describe("importFiles", () => {
  it("guarda libros con los metadatos extraídos", async () => {
    const extractors: Extractors = {
      pdf: vi.fn().mockResolvedValue({ title: "Informe anual", author: "ULL" }),
      epub: vi.fn().mockResolvedValue({ title: "Obabakoak", author: "Bernardo Atxaga" }),
    };

    const { imported, rejected } = await importFiles(
      [fakeFile("a.pdf", "application/pdf"), fakeFile("b.epub")],
      { database, extractors },
    );

    expect(rejected).toEqual([]);
    expect(imported.map((b) => b.format)).toEqual(["pdf", "epub"]);
    const stored = await listBooks(database);
    expect(stored.map((b) => b.title).sort()).toEqual(["Informe anual", "Obabakoak"]);
    expect(stored.every((b) => b.progress === 0)).toBe(true);
  });

  it("usa el nombre del archivo si la extracción falla", async () => {
    const extractors: Extractors = {
      pdf: vi.fn().mockRejectedValue(new Error("PDF dañado")),
      epub: vi.fn(),
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { imported } = await importFiles([fakeFile("mi_libro.pdf")], { database, extractors });

    expect(imported[0].title).toBe("mi libro");
    expect(imported[0].author).toBe("Autor desconocido");
  });

  it("rechaza archivos que no son PDF ni EPUB sin llamar a los extractores", async () => {
    const extractors: Extractors = { pdf: vi.fn(), epub: vi.fn() };

    const { imported, rejected } = await importFiles([fakeFile("foto.jpg", "image/jpeg")], {
      database,
      extractors,
    });

    expect(imported).toEqual([]);
    expect(rejected[0].name).toBe("foto.jpg");
    expect(extractors.pdf).not.toHaveBeenCalled();
  });
});

describe("biblioteca", () => {
  async function seed() {
    const extractors: Extractors = {
      pdf: vi.fn().mockResolvedValue({}),
      epub: vi.fn().mockResolvedValue({}),
    };
    const { imported } = await importFiles([fakeFile("uno.pdf"), fakeFile("dos.pdf")], {
      database,
      extractors,
    });
    return imported;
  }

  it("guarda el progreso, lo acota y sube el libro al principio de la lista", async () => {
    const [first] = await seed();
    await new Promise((r) => setTimeout(r, 5)); // garantiza lastOpenedAt > addedAt
    await saveProgress(first.id, 1.7, "12", database);

    const books = await listBooks(database);
    expect(books[0].id).toBe(first.id);
    expect(books[0].progress).toBe(1);
    expect(books[0].location).toBe("12");
  });

  it("elimina libros", async () => {
    const [first] = await seed();
    await deleteBook(first.id, database);
    expect((await listBooks(database)).map((b) => b.id)).not.toContain(first.id);
  });
});

describe("updateBookInfo", () => {
  async function oneBook() {
    const extractors: Extractors = { pdf: vi.fn().mockResolvedValue({}), epub: vi.fn() };
    const { imported } = await importFiles([fakeFile("AGUIMES021_261113.pdf")], { database, extractors });
    return imported[0];
  }

  it("cambia título y autor limpiando espacios", async () => {
    const book = await oneBook();
    const saved = await updateBookInfo(book.id, { title: "  Ordenanza   de costas ", author: " Ayto. de Agüimes " }, database);
    expect(saved).toEqual({ title: "Ordenanza de costas", author: "Ayto. de Agüimes" });
    const [stored] = await listBooks(database);
    expect(stored.title).toBe("Ordenanza de costas");
    expect(stored.author).toBe("Ayto. de Agüimes");
  });

  it("no permite un título vacío y deja el autor vacío como desconocido", async () => {
    const book = await oneBook();
    await expect(updateBookInfo(book.id, { title: "   ", author: "x" }, database)).rejects.toThrow("vacío");
    expect((await updateBookInfo(book.id, { title: "T", author: "  " }, database)).author).toBe("Autor desconocido");
  });

  it("avisa si el libro ya no existe", async () => {
    await expect(updateBookInfo("no-existe", { title: "T", author: "A" }, database)).rejects.toThrow("ya no está");
  });
});
