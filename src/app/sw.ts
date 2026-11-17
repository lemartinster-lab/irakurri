/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Service worker de Irakurri.
 * - Precarga toda la app (páginas estáticas, JS, CSS, pdf.js, epub.js) al instalarse,
 *   para poder leer sin conexión aunque nunca se haya abierto un libro con red.
 * - /leer?id=… usa la misma página precargada para cualquier libro (se ignora ?id).
 * - /api/ai nunca se guarda en caché (defaultCache ya excluye las rutas /api).
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    ignoreURLParametersMatching: [/.*/],
  },
  skipWaiting: true,
  clientsClaim: true,
  // Desactivado a propósito: con la precarga de navegación, abrir /leer?id=… sin conexión
  // acababa en la página de inicio en vez de usar la página del lector precargada.
  navigationPreload: false,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
