import { HIGHLIGHT_COLORS, sortAnnotations } from "./annotations";
import type { Annotation } from "./types";

/**
 * Exportación de subrayados, notas y marcadores de un libro a Markdown:
 * se lee bien como texto plano y se puede pegar en Google Docs, Notion, etc.
 */

/** Cita en Markdown: cada línea del texto empieza por "> ". */
function quote(text: string): string {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => `> ${line.trim()}`.trimEnd())
    .join("\n");
}

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

export function annotationsToMarkdown(
  book: { title: string; author: string },
  annotations: Annotation[],
  locationLabel: (a: Annotation) => string,
  date: Date = new Date(),
): string {
  const list = sortAnnotations(annotations);
  const highlights = list.filter((a) => a.kind === "highlight");
  const bookmarks = list.filter((a) => a.kind === "bookmark");
  const notes = list.filter((a) => a.note);
  const fecha = date.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

  const out: string[] = [
    `# ${book.title}`,
    "",
    `*${book.author}* · Notas exportadas de Irakurri el ${fecha}`,
    "",
    `${plural(highlights.length, "subrayado", "subrayados")} · ${plural(notes.length, "nota", "notas")} · ${plural(bookmarks.length, "marcador", "marcadores")}`,
  ];

  if (list.length === 0) {
    out.push("", "_Este libro todavía no tiene subrayados ni marcadores._");
    return `${out.join("\n")}\n`;
  }

  for (const a of list) {
    out.push("", "---", "");
    if (a.kind === "bookmark") {
      out.push(`**🔖 Marcador** · ${locationLabel(a)}`, "", a.text.trim());
    } else {
      const color = HIGHLIGHT_COLORS[a.color ?? "amarillo"].label.toLowerCase();
      out.push(`**Subrayado** (${color}) · ${locationLabel(a)}`, "", quote(a.text));
    }
    if (a.note) out.push("", `**Nota:** ${a.note.trim()}`);
  }

  return `${out.join("\n")}\n`;
}

/** Nombre de archivo seguro a partir del título: "Obabakoak-notas.md". */
export function exportFileName(title: string, ext = "md"): string {
  const base =
    title
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // quitar tildes
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "libro";
  return `${base}-notas.${ext}`;
}

/**
 * En el móvil abre el menú de compartir del sistema (WhatsApp, correo, Drive…);
 * si no está disponible, descarga el archivo. Devuelve qué se hizo.
 */
export async function shareOrDownload(title: string, markdown: string): Promise<"shared" | "downloaded" | "cancelled"> {
  // Android no siempre acepta .md para compartir: se prueba también como .txt
  const candidates = [
    new File([markdown], exportFileName(title, "md"), { type: "text/markdown" }),
    new File([markdown], exportFileName(title, "txt"), { type: "text/plain" }),
  ];
  const shareable = candidates.find((file) => navigator.canShare?.({ files: [file] }));
  if (shareable && navigator.share) {
    try {
      await navigator.share({ files: [shareable], title: `Notas: ${title}` });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
      // Si compartir falla por otro motivo, se descarga
    }
  }
  const url = URL.createObjectURL(candidates[0]);
  const a = document.createElement("a");
  a.href = url;
  a.download = candidates[0].name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
