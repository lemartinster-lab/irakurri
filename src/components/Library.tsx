"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { db, deleteBook, sortBooks } from "@/lib/db";
import { formatSize } from "@/lib/format";
import { importFiles } from "@/lib/import";
import { isStandalone, onLaunchFiles, requestPersistentStorage, type BeforeInstallPromptEvent } from "@/lib/pwa";
import type { Book } from "@/lib/types";
import { BookCard } from "./BookCard";

export function Library() {
  const books = useLiveQuery(async () => sortBooks(await db.books.toArray()), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  const handleFiles = useCallback(async (list: FileList | File[] | null) => {
    const files = list ? Array.from(list) : [];
    if (files.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      // Proteger la biblioteca frente a limpiezas automáticas del navegador
      void requestPersistentStorage();
      const { imported, rejected } = await importFiles(files);
      const parts: string[] = [];
      if (imported.length) parts.push(`${imported.length} libro(s) añadido(s)`);
      if (rejected.length) parts.push(rejected.map((r) => `${r.name}: ${r.reason}`).join(" · "));
      setMessage(parts.join(". "));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, []);

  // Ofrecer "Instalar" cuando el navegador lo permite, y abrir archivos con "Abrir con… Irakurri"
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      if (!isStandalone()) setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    onLaunchFiles((files) => void handleFiles(files));
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [handleFiles]);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const handleDelete = useCallback(async (book: Book) => {
    if (window.confirm(`¿Eliminar «${book.title}» de la biblioteca?`)) {
      await deleteBook(book.id);
    }
  }, []);

  const totalSize = books?.reduce((sum, b) => sum + b.size, 0) ?? 0;

  return (
    <div
      className="mx-auto min-h-screen max-w-6xl px-4 pb-16 pt-6 sm:px-6"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void handleFiles(e.dataTransfer.files);
      }}
    >
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight">Irakurri</h1>
          <p className="text-sm text-muted">
            {books === undefined
              ? "Cargando…"
              : `${books.length} libro(s)${books.length ? ` · ${formatSize(totalSize)}` : ""}`}
          </p>
        </div>
        {installPrompt && (
          <button
            type="button"
            onClick={() => void install()}
            className="ml-auto rounded-full border border-border px-4 py-2.5 text-sm font-medium hover:bg-surface"
          >
            Instalar
          </button>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Importando…" : "+ Añadir libros"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.epub,application/pdf,application/epub+zip"
          multiple
          hidden
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </header>

      {message && (
        <p role="status" className="mb-4 rounded-md border border-border bg-surface px-4 py-2 text-sm">
          {message}
        </p>
      )}

      {books && books.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center">
          <p className="font-serif text-xl">Tu biblioteca está vacía</p>
          <p className="mt-2 max-w-sm text-sm text-muted">
            Añade libros en PDF o EPUB. Se guardan solo en este dispositivo y funcionan sin conexión.
          </p>
        </div>
      )}

      {books && books.length > 0 && (
        <section className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {books.map((book) => (
            <BookCard key={book.id} book={book} onDelete={handleDelete} />
          ))}
        </section>
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent/15 backdrop-blur-sm">
          <p className="rounded-xl bg-surface px-6 py-4 font-semibold shadow-lg">Suelta aquí tus PDF o EPUB</p>
        </div>
      )}
    </div>
  );
}
