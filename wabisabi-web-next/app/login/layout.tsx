import type { Metadata } from "next";

// Página privada: fuera del índice. No se bloquea en robots.txt para que el
// crawler pueda leer este noindex.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
