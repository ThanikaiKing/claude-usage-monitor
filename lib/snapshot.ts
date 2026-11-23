import "server-only";
import data from "@/data/usage.json";
import type { Snapshot } from "./types";

/** The ingested snapshot, bundled at build time (Vercel has no access to ~/.claude). */
export function loadSnapshot(): Snapshot {
  return data as unknown as Snapshot;
}
