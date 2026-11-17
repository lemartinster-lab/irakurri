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

export type ExportMethod = "share-file" | "share-text" | "clipboard" | "download";
export type ExportResult = "shared" | "copied" | "downloaded" | "cancelled";

/**
 * Orden en que se intenta exportar según lo que permite el navegador.
 * - Móvil: menú de compartir con archivo; si el navegador no comparte archivos
 *   (p. ej. DuckDuckGo), compartir como texto; si tampoco, copiar al portapapeles.
 *   En móvil no se descarga: varios navegadores ignoran el nombre del archivo.
 * - Ordenador: descargar el archivo (ahí sí se respeta el nombre).
 */
export function exportPlan(caps: {
  mobile: boolean;
  canShareFiles: boolean;
  canShareText: boolean;
  hasClipboard: boolean;
}): ExportMethod[] {
  if (!caps.mobile) return ["download"];
  const plan: ExportMethod[] = [];
  if (caps.canShareFiles) plan.push("share-file");
  if (caps.canShareText) plan.push("share-text");
  if (caps.hasClipboard) plan.push("clipboard");
  plan.push("download"); // último recurso
  return plan;
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Exporta las notas por el mejor medio disponible. Devuelve qué se hizo. */
export async function shareOrDownload(title: string, markdown: string): Promise<ExportResult> {
  // Android no siempre acepta .md para compartir: se prueba también como .txt
  const candidates = [
    new File([markdown], exportFileName(title, "md"), { type: "text/markdown" }),
    new File([markdown], exportFileName(title, "txt"), { type: "text/plain" }),
  ];
  const shareableFile = candidates.find((file) => {
    try {
      return navigator.canShare?.({ files: [file] }) ?? false;
    } catch {
      return false;
    }
  });
  const textData = { title: `Notas: ${title}`, text: markdown };
  const canShareText =
    typeof navigator.share === "function" && (navigator.canShare ? navigator.canShare(textData) : true);

  const plan = exportPlan({
    mobile: window.matchMedia?.("(pointer: coarse)").matches ?? false,
    canShareFiles: Boolean(shareableFile && navigator.share),
    canShareText,
    hasClipboard: Boolean(navigator.clipboard?.writeText),
  });

  for (const method of plan) {
    try {
      if (method === "share-file") {
        await navigator.share({ files: [shareableFile!], title: textData.title });
        return "shared";
      }
      if (method === "share-text") {
        await navigator.share(textData);
        return "shared";
      }
      if (method === "clipboard") {
        await navigator.clipboard.writeText(markdown);
        return "copied";
      }
      download(candidates[0]);
      return "downloaded";
    } catch (err) {
      // El usuario cerró el menú de compartir: no se intenta otra cosa
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
      // Cualquier otro fallo: se prueba el siguiente método
    }
  }
  return "cancelled";
}
