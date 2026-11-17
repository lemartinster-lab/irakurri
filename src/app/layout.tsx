import type { Metadata, Viewport } from "next";
import { UpdateBanner } from "@/components/UpdateBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Irakurri",
  description: "Lector de libros PDF y EPUB. Tus libros se guardan solo en tu dispositivo.",
  applicationName: "Irakurri",
  // iPhone/iPad: "Añadir a pantalla de inicio" desde Safari abre como app a pantalla completa
  appleWebApp: { capable: true, title: "Irakurri", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#16161a" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="antialiased">
        {children}
        <UpdateBanner />
      </body>
    </html>
  );
}
