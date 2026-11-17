import { randomUUID } from "node:crypto";
import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

// Las páginas (biblioteca y lector) se precargan con una revisión nueva en cada despliegue,
// para que el móvil descargue la versión actualizada cuando haya conexión.
const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? randomUUID();

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // En desarrollo el service worker estorba (caché de código viejo)
  disable: process.env.NODE_ENV === "development",
  // No recargar la página al recuperar la conexión: sacaría al usuario del libro que está leyendo
  reloadOnOnline: false,
  // El worker de pdf.js pesa ~1,2 MB: subir el límite por defecto (2 MB) con margen
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  additionalPrecacheEntries: [
    { url: "/", revision },
    { url: "/leer", revision },
    { url: "/manifest.webmanifest", revision },
  ],
});

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// Versión visible en la app: commit de Vercel (7 caracteres) y fecha del build
const appVersion = `${(process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7)} · ${new Date().toISOString().slice(0, 10)}`;

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: appVersion },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // El service worker no debe quedarse en la caché HTTP, o las actualizaciones tardarían en llegar
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default withSerwist(nextConfig);
