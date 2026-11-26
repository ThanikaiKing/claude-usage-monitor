/** Token usage summed over one or more API responses. */
export interface Usage {
  /** API responses (deduped by message id). */
  n: number;
  in: number;
  out: number;
  /** Thinking tokens (already included in `out`). */
  think: number;
  /** Cache reads. */
  cr: number;
  /** Cache writes, 5-minute TTL. */
  cw5: number;
  /** Cache writes, 1-hour TTL. */
  cw1h: number;
  web: number;
}

/** An hourly bucket of usage inside a session (local time). */
export interface Bucket {
  /** Local date-hour, "YYYY-MM-DDTHH". */
  h: string;
  model: string;
  /** True for subagent (sidechain) traffic. */
  sub: boolean;
  u: Usage;
}

/** One main-chain API call: [epochMs, contextTokens, outputTokens, modelIndex]. */
export type Turn = [number, number, number, number];
/** [local day "YYYY-MM-DD", start ms, end ms] */
export type ActiveSpan = [string, number, number];

export interface ToolStat {
  calls: number;
  errors: number;
}

export interface Session {
  id: string;
  project: string;
  cwd: string;
  title: string | null;
  start: number;
  end: number;
  /** Hands-on time: sum of gaps between events, each capped at 45 minutes. */
  activeMs: number;
  /** The spans behind activeMs, split at local midnight. Missing on snapshots from before it existed. */
  active?: ActiveSpan[];
  entrypoint: string;
  version: string;
  gitBranch: string | null;
  prompts: number;
  effort: Record<string, number>;
  tools: Record<string, ToolStat>;
  subagents: Record<string, number>;
  buckets: Bucket[];
  /** Models referenced by Turn[3]. */
  turnModels: string[];
  turns: Turn[];
  /** Claude Code's own cost estimate from cost-state records, when present. */
  reportedCostUSD: number | null;
}

export interface LegacyDay {
  date: string;
  messages: number;
  sessions: number;
  toolCalls: number;
  tokensByModel: Record<string, number>;
}

export interface LegacyModelTotals {
  in: number;
  out: number;
  cr: number;
  cw: number;
}

export interface LegacyStats {
  from: string | null;
  to: string | null;
  days: LegacyDay[];
  modelTotals: Record<string, LegacyModelTotals>;
  hourCounts: Record<string, number>;
  totalSessions: number;
  totalMessages: number;
}

export interface PromptStats {
  from: string | null;
  to: string | null;
  /** date -> project -> count */
  byDay: Record<string, Record<string, number>>;
  /** [weekday 0=Sun..6][hour 0..23] */
  weekHour: number[][];
}

export interface MachineStats {
  /** process.platform of the machine that wrote this entry. */
  platform: string;
  generatedAt: string;
  /**
   * Set on data carried over from a snapshot written before per-machine tracking. The next
   * ingest on a machine of the same platform replaces it with that machine's own entry.
   */
  imported?: boolean;
  legacy: LegacyStats;
  prompts: PromptStats;
}

export interface Snapshot {
  version: 1;
  generatedAt: string;
  timeZone: string;
  sessions: Session[];
  /** Pre-transcript aggregates from stats-cache.json, summed across machines. */
  legacy: LegacyStats;
  /** Prompt counts from history.jsonl (text is never exported), summed across machines. */
  prompts: PromptStats;
  /**
   * Per-machine copies of `legacy` and `prompts`, keyed by a hash of the hostname. Each machine
   * only rewrites its own entry, so several machines can sync into one snapshot.
   */
  machines?: Record<string, MachineStats>;
  redacted: boolean;
}

export const emptyUsage = (): Usage => ({ n: 0, in: 0, out: 0, think: 0, cr: 0, cw5: 0, cw1h: 0, web: 0 });

export function addUsage(a: Usage, b: Usage): Usage {
  a.n += b.n;
  a.in += b.in;
  a.out += b.out;
  a.think += b.think;
  a.cr += b.cr;
  a.cw5 += b.cw5;
  a.cw1h += b.cw1h;
  a.web += b.web;
  return a;
}

export const totalTokens = (u: Usage) => u.in + u.out + u.cr + u.cw5 + u.cw1h;
export const inputSide = (u: Usage) => u.in + u.cr + u.cw5 + u.cw1h;
