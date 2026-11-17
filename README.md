# Irakurri

Lector de libros **PDF y EPUB** como aplicación web instalable. Los libros se guardan solo en el dispositivo (IndexedDB); no hay servidor ni cuentas.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS 4
- [pdf.js](https://mozilla.github.io/pdf.js/) (`pdfjs-dist`) para PDF
- [epub.js](https://github.com/futurepress/epub.js) para EPUB
- [Dexie](https://dexie.org/) sobre IndexedDB para la biblioteca
- Vitest + fake-indexeddb para tests

## Scripts

```bash
npm run dev        # desarrollo en http://localhost:3000
npm run typecheck  # tsc --noEmit
npm test           # vitest
npm run build
```

## Estructura

```
src/app/            páginas: biblioteca (/) y lector (/leer/[id])
src/components/     Library, BookCard
src/lib/db.ts       base de datos local y operaciones
src/lib/import.ts   importación de archivos
src/lib/metadata/   extracción de título, autor y portada (PDF/EPUB)
tests/              tests unitarios
```

## Despliegue en Vercel

1. En [vercel.com/new](https://vercel.com/new) importa el repositorio `lemartinster-lab/irakurri` (Vercel detecta Next.js solo).
2. Antes de pulsar *Deploy*, añade las variables de entorno de la sección siguiente.
3. Cada `git push` a `main` vuelve a desplegar automáticamente.

## Instalar en el móvil

- **Android (Chrome):** abre la web y pulsa **Instalar** en la biblioteca (o menú ⋮ → *Instalar aplicación*). Después podrás abrir PDF y EPUB con *Abrir con… → Irakurri*.
- **iPhone/iPad (Safari):** botón Compartir → *Añadir a pantalla de inicio*.

Una vez abierta con conexión, la app funciona **sin conexión**: biblioteca, lectores, subrayados y notas. Solo la IA necesita Internet.

## Configuración de la IA

La IA funciona a través de la ruta de servidor `/api/ai`, que llama a la API de Claude. La clave **nunca llega al navegador**.

| Variable | | Para qué |
|---|---|---|
| `ANTHROPIC_API_KEY` | obligatoria | Clave de la API de Anthropic |
| `IRAKURRI_ACCESS_CODE` | recomendada | Código que la app pide una vez; protege tu saldo si la URL es pública |
| `AI_MODEL` | opcional | Modelo de Claude (por defecto `claude-sonnet-5-5`) |

En local: copia `.env.example` a `.env.local`. En Vercel: *Settings → Environment Variables*.

Solo se envía a Claude el texto seleccionado o el de la página/capítulo que pides resumir; los libros siguen sin salir del dispositivo.

## Hoja de ruta

1. ✅ Base y biblioteca (importar, metadatos, portadas)
2. ✅ Lector de PDF (zoom, páginas, gestos, modo noche, recordar posición)
3. ✅ Lector de EPUB (índice, tipografía, temas claro/sepia/oscuro, progreso)
4. ✅ Marcadores, subrayados en 4 colores y notas (PDF y EPUB)
5. ✅ IA con Claude: explicar, traducir (es/eu/en/fr) y resumir la selección; resumir página o capítulo
6. ✅ App instalable (PWA) que funciona sin conexión; lista para Vercel
