import type { Usage } from "./types";

/**
 * API list prices in USD per million tokens (Anthropic first-party).
 * Source: claude-api reference, model table cached 2026-11-03. Edit here to re-price everything.
 * Cache writes: 1.25x input (5m TTL), 2x input (1h TTL). Cache reads: explicit rate where
 * published, otherwise 0.1x input. Web search: $10 per 1,000 requests.
 */
export const PRICING_AS_OF = "2026-11-03";

interface Rate {
  label: string;
  in: number;
  out: number;
  cacheRead?: number;
}

const RATES: Record<string, Rate> = {
  "claude-fable-5-2": { label: "Fable 5.2", in: 8, out: 40, cacheRead: 0.2 },
  "claude-fable-5-1": { label: "Fable 5.1", in: 10, out: 50 },
  "claude-fable-5": { label: "Fable 5", in: 10, out: 50 },
  "claude-opus-5-5": { label: "Opus 5.5", in: 4, out: 20, cacheRead: 0.2 },
  "claude-opus-5": { label: "Opus 5", in: 5, out: 25 },
  "claude-opus-4-8": { label: "Opus 4.8", in: 5, out: 25 },
  "claude-opus-4-7": { label: "Opus 4.7", in: 5, out: 25 },
  "claude-opus-4-6": { label: "Opus 4.6", in: 5, out: 25 },
  "claude-sonnet-5-5": { label: "Sonnet 5.5", in: 2, out: 10, cacheRead: 0.1 },
  "claude-sonnet-5": { label: "Sonnet 5", in: 2, out: 10 },
  "claude-sonnet-4-6": { label: "Sonnet 4.6", in: 3, out: 15 },
  "claude-haiku-5-5": { label: "Haiku 5.5", in: 0.1, out: 0.5 },
  "claude-haiku-4-5": { label: "Haiku 4.5", in: 1, out: 5 },
};

const WEB_SEARCH_PER_REQUEST = 0.01;

function rateFor(model: string): Rate | undefined {
  if (RATES[model]) return RATES[model];
  // Strip date suffixes such as claude-haiku-4-5-20251001.
  const base = model.replace(/-\d{8}$/, "");
  return RATES[base];
}

export const isPriced = (model: string) => rateFor(model) !== undefined;

export function modelLabel(model: string): string {
  return rateFor(model)?.label ?? model.replace(/^claude-/, "");
}

export interface CostBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  web: number;
  total: number;
  /** What the cache reads would have cost at the full input rate, minus what they did cost. */
  cacheSavings: number;
}

const M = 1_000_000;

export function costOf(model: string, u: Usage): CostBreakdown {
  const r = rateFor(model);
  if (!r) return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, web: 0, total: 0, cacheSavings: 0 };
  const readRate = r.cacheRead ?? r.in * 0.1;
  const input = (u.in * r.in) / M;
  const output = (u.out * r.out) / M;
  const cacheRead = (u.cr * readRate) / M;
  const cacheWrite = (u.cw5 * r.in * 1.25 + u.cw1h * r.in * 2) / M;
  const web = u.web * WEB_SEARCH_PER_REQUEST;
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    web,
    total: input + output + cacheRead + cacheWrite + web,
    cacheSavings: (u.cr * (r.in - readRate)) / M,
  };
}

/** Legacy stats-cache totals do not split cache writes by TTL; price them at the 5m rate. */
export function legacyCost(model: string, t: { in: number; out: number; cr: number; cw: number }): number {
  return costOf(model, { n: 0, in: t.in, out: t.out, think: 0, cr: t.cr, cw5: t.cw, cw1h: 0, web: 0 }).total;
}
