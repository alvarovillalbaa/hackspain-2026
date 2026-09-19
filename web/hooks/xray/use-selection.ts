"use client";

import { useCallback, useMemo, useState } from "react";

export function useSelection<T extends string>(initial: T[] = []) {
  const [selected, setSelected] = useState<Set<T>>(() => new Set(initial));

  const toggle = useCallback((id: T) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const select = useCallback((id: T) => {
    setSelected((prev) => new Set(prev).add(id));
  }, []);

  const deselect = useCallback((id: T) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const setAll = useCallback((ids: T[]) => setSelected(new Set(ids)), []);

  const isSelected = useCallback((id: T) => selected.has(id), [selected]);

  const values = useMemo(() => [...selected], [selected]);

  return {
    selected,
    values,
    toggle,
    select,
    deselect,
    clear,
    setAll,
    isSelected,
    count: selected.size,
  };
}
