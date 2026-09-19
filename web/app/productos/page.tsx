"use client";

import { AppShell } from "@/components/xray/app-shell";
import { ProductosBook } from "@/components/embat/productos-book";

export default function ProductosPage() {
  return (
    <AppShell crumbs={[{ label: "Productos" }]}>
      <ProductosBook />
    </AppShell>
  );
}
