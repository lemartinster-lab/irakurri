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

## Hoja de ruta

1. ✅ Base y biblioteca (importar, metadatos, portadas)
2. ✅ Lector de PDF (zoom, páginas, gestos, modo noche, recordar posición)
3. ✅ Lector de EPUB (índice, tipografía, temas claro/sepia/oscuro, progreso)
4. Marcadores y subrayados con notas
5. IA con Claude (resumir, traducir, explicar)
6. PWA instalable y despliegue en Vercel
