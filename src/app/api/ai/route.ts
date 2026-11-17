import { timingSafeEqual } from "node:crypto";
import { buildPrompt, createSseTextParser, modelOptions, validateAiRequest } from "@/lib/ai/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5-5";

function errorResponse(status: number, error: string) {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

/** Comparación en tiempo constante para que el código no se pueda adivinar midiendo tiempos. */
function sameCode(given: string | null, expected: string): boolean {
  // Se ignoran espacios y saltos de línea en los extremos: al pegar el código en
  // Vercel o al escribirlo en el móvil es fácil que se cuele uno invisible
  const g = given?.trim();
  if (!g) return false;
  const a = Buffer.from(g);
  const b = Buffer.from(expected.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST /api/ai — reenvía la petición a Claude y devuelve la respuesta en streaming
 * como texto plano. La clave de la API nunca sale del servidor.
 */
export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return errorResponse(503, "La IA no está configurada en el servidor (falta ANTHROPIC_API_KEY).");
  }

  // Protección opcional: sin ella, cualquiera que conozca la URL gastaría tu saldo
  const accessCode = process.env.IRAKURRI_ACCESS_CODE?.trim();
  if (accessCode &&!sameCode(req.headers.get("x-irakurri-code"), accessCode)) {
    return errorResponse(401, "Código de acceso incorrecto.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "Petición mal formada.");
  }
  const validation = validateAiRequest(body);
  if (!validation.ok) return errorResponse(400, validation.error);

  const { system, user, maxTokens } = buildPrompt(validation.value);
  const model = process.env.AI_MODEL?.trim() || DEFAULT_MODEL;

  let upstream: Response;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        ...modelOptions(model),
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
        stream: true,
      }),
      signal: req.signal,
    });
  } catch {
    return errorResponse(502, "No se pudo conectar con el servicio de IA.");
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error("Anthropic API", upstream.status, detail.slice(0, 500));
    if (upstream.status === 429) return errorResponse(429, "Demasiadas peticiones seguidas. Espera un momento.");
    if (upstream.status === 401 || upstream.status === 403) {
      return errorResponse(502, "La clave de la API de Anthropic no es válida.");
    }
    if (upstream.status === 529) return errorResponse(503, "El servicio de IA está saturado. Inténtalo en unos minutos.");
    return errorResponse(502, "El servicio de IA devolvió un error.");
  }

  const parser = createSseTextParser();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = upstream.body.getReader();
  let sentText = false;
  let stopReason: string | undefined;

  const stream = new ReadableStream<Uint8Array>({
    // Importante: cada llamada a pull() debe entregar algo (texto, fin o error).
    // Si vuelve sin entregar nada, el stream no la repite y la respuesta se queda
    // colgada. Claude envía trozos sin texto (message_start, ping, razonamiento…),
    // así que se sigue leyendo hasta que haya texto.
    async pull(controller) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            // Nunca devolver una respuesta vacía como si fuera correcta
            if (!sentText) {
              console.error("Anthropic API: respuesta sin texto", { model, stopReason });
              return controller.error(new Error(`Respuesta vacía (${stopReason ?? "sin motivo"})`));
            }
            return controller.close();
          }
          const parsed = parser.push(decoder.decode(value, { stream: true }));
          stopReason = parsed.stopReason ?? stopReason;
          if (parsed.error) return controller.error(new Error(parsed.error));
          if (parsed.text) {
            sentText = true;
            return controller.enqueue(encoder.encode(parsed.text));
          }
        }
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      void reader.cancel();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
