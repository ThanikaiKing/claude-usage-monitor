"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_FILTERS, type Filters, type RangeKey, type View, applyFilters } from "@/lib/aggregate";
import type { Snapshot } from "@/lib/types";

interface DataState {
  snapshot: Snapshot;
  filters: Filters;
  setFilters: (patch: Partial<Filters>) => void;
  views: View[];
}

const Ctx = createContext<DataState | null>(null);
const RANGES: RangeKey[] = ["7d", "14d", "30d", "all"];

function readUrl(): Filters {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  const q = new URLSearchParams(window.location.search);
  const range = q.get("range") as RangeKey | null;
  return {
    range: range && RANGES.includes(range) ? range : DEFAULT_FILTERS.range,
    project: q.get("project"),
    model: q.get("model"),
  };
}

export function DataProvider({ snapshot, children }: { snapshot: Snapshot; children: React.ReactNode }) {
  const [filters, setState] = useState<Filters>(DEFAULT_FILTERS);

  // Filters live in the URL so a filtered view can be shared; read it once after hydration.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from the URL after hydration
    setState(readUrl());
  }, []);

  const setFilters = useCallback((patch: Partial<Filters>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      const q = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(next)) {
        if (v && v !== (DEFAULT_FILTERS as unknown as Record<string, unknown>)[k]) q.set(k, String(v));
        else q.delete(k);
      }
      const qs = q.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
      return next;
    });
  }, []);

  const views = useMemo(() => applyFilters(snapshot, filters), [snapshot, filters]);
  const value = useMemo(() => ({ snapshot, filters, setFilters, views }), [snapshot, filters, setFilters, views]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData must be used inside DataProvider");
  return v;
}
