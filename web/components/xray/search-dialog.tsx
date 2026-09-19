"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useSearch } from "@/components/xray/search-context";
import { useCompanies } from "@/hooks/xray/use-companies";
import { embatUiClass } from "@/components/embat/font";

export function SearchDialog() {
  const { open, setOpen } = useSearch();
  const router = useRouter();
  const { data: companies } = useCompanies();

  const items = useMemo(
    () =>
      [...companies].sort((a, b) =>
        a.name.localeCompare(b.name, "es", { sensitivity: "base" })
      ),
    [companies]
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Buscar"
      description="Busca empresas por nombre, identificador o grupo"
      className={embatUiClass}
    >
      <CommandInput placeholder="Buscar empresa…" />
      <CommandList>
        <CommandEmpty>No hay resultados.</CommandEmpty>
        <CommandGroup heading="Empresas">
          {items.map((c) => (
            <CommandItem
              key={c.company_id}
              value={`${c.name} ${c.company_id} ${c.group_id}`}
              onSelect={() => {
                setOpen(false);
                router.push(`/c/${c.company_id}`);
              }}
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {c.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {c.company_id}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
