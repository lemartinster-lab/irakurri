"use client";

import { useEffect, useState } from "react";

/**
 * Avisa cuando hay una versión nueva de la app.
 *
 * La app funciona sin conexión gracias al service worker, que guarda una copia en el
 * dispositivo. Al publicar una versión nueva, el service worker nuevo se instala y toma
 * el control (skipWaiting + clientsClaim), pero la página abierta sigue ejecutando el
 * código antiguo hasta que se recarga. Este aviso permite recargar en ese momento.
 */
export function UpdateBanner() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Si no había service worker al abrir, el primer "controllerchange" es la
    // instalación inicial, no una actualización: no se avisa
    const hadController = Boolean(navigator.serviceWorker.controller);
    const onControllerChange = () => {
      if (hadController) setUpdateReady(true);
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    // Buscar actualizaciones al volver a la app (la PWA puede pasar días abierta)
    const checkForUpdate = () => {
      if (document.visibilityState === "visible") {
        void navigator.serviceWorker.getRegistration().then((reg) => reg?.update().catch(() => undefined));
      }
    };
    document.addEventListener("visibilitychange", checkForUpdate);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", checkForUpdate);
    };
  }, []);

  if (!updateReady) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 top-3 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-xl bg-[#1f1d1a] px-4 py-3 text-sm text-white shadow-2xl"
    >
      <span className="flex-1">Hay una versión nueva de Irakurri.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-full bg-[#b5452f] px-4 py-1.5 font-semibold"
      >
        Actualizar
      </button>
      <button type="button" onClick={() => setUpdateReady(false)} className="px-1 opacity-70" aria-label="Más tarde">
        ✕
      </button>
    </div>
  );
}
