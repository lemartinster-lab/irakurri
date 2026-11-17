/**
 * Utilidades de app instalable (PWA).
 */

/** Evento de Chrome/Android/Edge para ofrecer la instalación desde la propia app. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** API de "Abrir con…" para archivos (Chrome en escritorio y Android). */
interface LaunchParams {
  files: FileSystemFileHandle[];
}
interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void;
}

export function onLaunchFiles(handler: (files: File[]) => void) {
  const queue = (window as unknown as { launchQueue?: LaunchQueue }).launchQueue;
  queue?.setConsumer(async ({ files }) => {
    if (!files?.length) return;
    handler(await Promise.all(files.map((f) => f.getFile())));
  });
}

/**
 * Pide al navegador que no borre los datos de la app cuando falte espacio.
 * Sin esto, Safari y Chrome pueden vaciar IndexedDB (¡y los libros con ella!)
 * tras semanas sin abrir la app. Devuelve si el almacenamiento queda protegido.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** ¿Se está ejecutando como app instalada? */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
