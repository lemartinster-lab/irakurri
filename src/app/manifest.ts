import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Irakurri — lector de libros",
    short_name: "Irakurri",
    description: "Lee tus libros PDF y EPUB, con subrayados, notas y asistente de IA. Tus libros se quedan en tu dispositivo.",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#faf7f2",
    theme_color: "#b5452f",
    categories: ["books", "education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Abrir PDF/EPUB desde el móvil con "Abrir con… Irakurri" (Chrome/Android, escritorio)
    file_handlers: [
      { action: "/", accept: { "application/pdf": [".pdf"], "application/epub+zip": [".epub"] } },
    ],
  } as MetadataRoute.Manifest;
}
