import type { AiRequest } from "./prompts";

export const ACCESS_CODE_KEY = "irakurri:ai-code";

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

/** Llama a /api/ai y va entregando el texto a medida que llega. Devuelve el texto completo. */
export async function askAi(
  request: AiRequest,
  { onText, signal }: { onText: (full: string) => void; signal?: AbortSignal },
): Promise<string> {
  const offline = new AiError("Sin conexión a Internet. La lectura funciona sin red, pero la IA la necesita.", "other");
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw offline;

  let res: Response;
  try {
    res = await fetch("/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json", "x-irakurri-code": getAccessCode() },
      body: JSON.stringify(request),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw offline; // fallo de red (TypeError "Failed to fetch")
  }

  if (!res.ok || !res.body) {
    const { error } = (await res.json().catch(() => ({}))) as { error?: string };
    const kind = res.status === 401 ? "code" : res.status === 503 && error?.includes("configurada") ? "config" : "other";
    throw new AiError(error ?? `Error ${res.status}`, kind);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
    onText(full);
  }
  return full;
}
