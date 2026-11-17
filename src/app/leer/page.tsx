import { Suspense } from "react";
import { ReaderView } from "./ReaderView";

export default function ReaderPage() {
  return (
    <Suspense fallback={<p className="mt-24 text-center text-muted">Cargando…</p>}>
      <ReaderView />
    </Suspense>
  );
}
