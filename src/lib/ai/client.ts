import type { AiRequest } from "./prompts";

export const ACCESS_CODE_KEY = "irakurri:ai-code";
/** Si Claude no empieza a responder en este tiempo, se avisa en vez de esperar sin fin. */
export const FIRST_BYTE_TIMEOUT_MS = 30_000;

export class AiError extends Error {
  constructor(
    message: string,
    /** "code": falta o es incorrecto el código de acceso */
    readonly kind: "code" | "config" | "other",
  ) {
    super(message);
    this.name = "AiError";
  }
}

export function getAccessCode(): string {
  try {
    return localStorage.getItem(ACCESS_CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAccessCode(code: string) {
  try {
    localStorage.setItem(ACCESS_CODE_KEY, code.trim());
  } catch {
    /* sin almacenamiento: habrá que escribirlo cada vez */
  }
}

/** Mensaje comprensible para respuestas de error sin JSON (p. ej. las de la plataforma de Vercel). */
export function messageForStatus(status: number): string {
  if (status === 504 || status === 408) return "El servidor tardó demasiado en responder. Inténtalo de nuevo.";
  if (status === 413) return "El texto es demasiado largo para enviarlo.";
  if (status === 429) return "Demasiadas peticiones seguidas. Espera un momento.";
  if (status >= 500) return "El servidor de la IA tuvo un problema. Inténtalo de nuevo en un momento.";
  return `Error inesperado (${status}).`;
}

const OFFLINE_MESSAGE = "Sin conexión a Internet. La lectura funciona sin red, pero la IA la necesita.";
const TIMEOUT_MESSAGE = "Claude no ha empezado a responder a tiempo. Inténtalo de nuevo.";
const EMPTY_MESSAGE = "Claude no ha devuelto ningún texto esta vez. Pulsa Reintentar.";
const INTERRUPTED_MESSAGE = "La respuesta de Claude se interrumpió. Pulsa Reintentar.";

/** Llama a /api/ai y va entregando el texto a medida que llega. Devuelve el texto completo. */
export async function askAi(
  request: AiRequest,
  { onText, signal }: { onText: (full: string) => void; signal?: AbortSignal },
): Promise<string> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new AiError(OFFLINE_MESSAGE, "other");

  // Se cancela si el usuario cierra la ventana o si no llega nada a tiempo
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, FIRST_BYTE_TIMEOUT_MS);

  const fail = (err: unknown): never => {
    if (timedOut) throw new AiError(TIMEOUT_MESSAGE, "other");
    if (signal?.aborted) throw err;
    if (err instanceof AiError) throw err;
    throw new AiError(OFFLINE_MESSAGE, "other"); // fallo de red ("Failed to fetch")
  };

  try {
    let res: Response;
    try {
      res = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json", "x-irakurri-code": getAccessCode() },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch (err) {
      return fail(err);
    }

    if (!res.ok || !res.body) {
      clearTimeout(timer);
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      const kind = res.status === 401 ? "code" : res.status === 503 && error?.includes("configurada") ? "config" : "other";
      throw new AiError(error ?? messageForStatus(res.status), kind);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        clearTimeout(timer); // ya está respondiendo: sin límite para el resto
        full += decoder.decode(value, { stream: true });
        onText(full);
      }
    } catch (err) {
      if (timedOut || signal?.aborted) return fail(err);
      // Ya había respuesta del servidor: no es falta de conexión, es un corte o una respuesta vacía
      throw new AiError(full ? INTERRUPTED_MESSAGE : EMPTY_MESSAGE, "other");
    }
    if (!full.trim()) throw new AiError(EMPTY_MESSAGE, "other");
    return full;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
