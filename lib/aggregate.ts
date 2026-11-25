import { costOf, legacyCost, modelLabel } from "./pricing";
import { type ActiveSpan, type Session, type Snapshot, type Usage, addUsage, emptyUsage, inputSide, totalTokens } from "./types";

export type RangeKey = "7d" | "14d" | "30d" | "all";

export interface Filters {
  range: RangeKey;
  project: string | null;
  model: string | null;
}

export const DEFAULT_FILTERS: Filters = { range: "all", project: null, model: null };

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** Fixed series order so a model keeps its colour across every filter. */
const MODEL_ORDER = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-2"];

export function seriesSlot(index: number) {
  return `var(--series-${(index % 8) + 1})`;
}

/** Latest day with transcript activity (anchor for relative ranges). */
export function lastDay(snapshot: Snapshot): string {
  let last = "";
  for (const s of snapshot.sessions) for (const b of s.buckets) if (b.h.slice(0, 10) > last) last = b.h.slice(0, 10);
  return last || dayKey(new Date(snapshot.generatedAt));
}

export function rangeStart(snapshot: Snapshot, range: RangeKey): string | null {
  if (range === "all") return null;
  const days = { "7d": 7, "14d": 14, "30d": 30 }[range];
  return dayKey(new Date(parseDay(lastDay(snapshot)).getTime() - (days - 1) * DAY_MS));
}

/** A session reduced to the buckets that match the filters. */
export interface View {
  session: Session;
  usage: Usage;
  cost: number;
  byModel: Map<string, Usage>;
}

export function applyFilters(snapshot: Snapshot, f: Filters): View[] {
  const from = rangeStart(snapshot, f.range);
  const out: View[] = [];
  for (const s of snapshot.sessions) {
    if (f.project && s.project !== f.project) continue;
    const byModel = new Map<string, Usage>();
    for (const b of s.buckets) {
      if (from && b.h.slice(0, 10) < from) continue;
      if (f.model && b.model !== f.model) continue;
      addUsage(byModel.get(b.model) ?? byModel.set(b.model, emptyUsage()).get(b.model)!, b.u);
    }
    if (byModel.size === 0) continue;
    const usage = emptyUsage();
    let cost = 0;
    for (const [m, u] of byModel) {
      addUsage(usage, u);
      cost += costOf(m, u).total;
    }
    out.push({ session: s, usage, cost, byModel });
  }
  return out;
}

export function allModels(snapshot: Snapshot): string[] {
  const set = new Set<string>();
  for (const s of snapshot.sessions) for (const b of s.buckets) set.add(b.model);
  return [...set].sort((a, b) => {
    const ia = MODEL_ORDER.indexOf(a);
    const ib = MODEL_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
}

export function modelColor(snapshot: Snapshot, model: string) {
  return seriesSlot(allModels(snapshot).indexOf(model));
}

/** Projects ranked by all-time cost; the rank fixes each project's colour. */
export function allProjects(snapshot: Snapshot): string[] {
  const cost = new Map<string, number>();
  for (const v of applyFilters(snapshot, DEFAULT_FILTERS)) cost.set(v.session.project, (cost.get(v.session.project) ?? 0) + v.cost);
  return [...cost.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

export interface Totals {
  usage: Usage;
  cost: number;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  cacheSavings: number;
  sessions: number;
  prompts: number;
  activeMs: number;
  toolCalls: number;
  toolErrors: number;
  subagentRuns: number;
  cacheHitRate: number;
  activeDays: number;
}

export function totals(views: View[]): Totals {
  const usage = emptyUsage();
  const t: Totals = {
    usage,
    cost: 0,
    inputCost: 0,
    outputCost: 0,
    cacheReadCost: 0,
    cacheWriteCost: 0,
    cacheSavings: 0,
    sessions: views.length,
    prompts: 0,
    activeMs: 0,
    toolCalls: 0,
    toolErrors: 0,
    subagentRuns: 0,
    cacheHitRate: 0,
    activeDays: 0,
  };
  const days = new Set<string>();
  for (const v of views) {
    addUsage(usage, v.usage);
    for (const [m, u] of v.byModel) {
      const c = costOf(m, u);
      t.cost += c.total;
      t.inputCost += c.input;
      t.outputCost += c.output;
      t.cacheReadCost += c.cacheRead;
      t.cacheWriteCost += c.cacheWrite;
      t.cacheSavings += c.cacheSavings;
    }
    t.prompts += v.session.prompts;
    for (const ts of Object.values(v.session.tools)) {
      t.toolCalls += ts.calls;
      t.toolErrors += ts.errors;
    }
    t.subagentRuns += Object.values(v.session.subagents).reduce((a, b) => a + b, 0);
    for (const b of v.session.buckets) days.add(b.h.slice(0, 10));
  }
  const side = inputSide(usage);
  t.cacheHitRate = side ? usage.cr / side : 0;
  t.activeDays = days.size;
  t.activeMs = sumValues(activeByDay(views.map((v) => v.session)));
  return t;
}

export interface DayRow {
  day: string;
  usage: Usage;
  cost: number;
  costByModel: Record<string, number>;
  tokensByModel: Record<string, number>;
  sessions: number;
  /** Hands-on time on this day, parallel sessions counted once (see activeByDay). */
  activeMs: number;
}

/** A session's active spans; older snapshots without them fall back to one span from its start. */
function spansOf(s: Session): ActiveSpan[] {
  if (s.active) return s.active;
  return s.activeMs ? [[dayKey(new Date(s.start)), s.start, s.start + s.activeMs]] : [];
}

/**
 * Hands-on time per local day across a set of sessions, as the union of their
 * active spans, so time spent with several sessions open counts once.
 */
export function activeByDay(sessions: Session[]): Map<string, number> {
  const byDay = new Map<string, [number, number][]>();
  for (const s of sessions)
    for (const [day, a, b] of spansOf(s)) (byDay.get(day) ?? byDay.set(day, []).get(day)!).push([a, b]);
  const out = new Map<string, number>();
  for (const [day, spans] of byDay) {
    spans.sort((x, y) => x[0] - y[0]);
    let ms = 0;
    let [a, b] = spans[0];
    for (const [c, d] of spans.slice(1)) {
      if (c > b) {
        ms += b - a;
        [a, b] = [c, d];
      } else b = Math.max(b, d);
    }
    out.set(day, ms + b - a);
  }
  return out;
}

const sumValues = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

/** Daily rows over the filtered range, including empty days so gaps show. */
export function daily(snapshot: Snapshot, f: Filters): DayRow[] {
  const from = rangeStart(snapshot, f.range);
  const rows = new Map<string, DayRow & { ids: Set<string> }>();
  for (const s of snapshot.sessions) {
    if (f.project && s.project !== f.project) continue;
    for (const b of s.buckets) {
      const day = b.h.slice(0, 10);
      if (from && day < from) continue;
      if (f.model && b.model !== f.model) continue;
      let r = rows.get(day);
      if (!r) {
        r = { day, usage: emptyUsage(), cost: 0, costByModel: {}, tokensByModel: {}, sessions: 0, activeMs: 0, ids: new Set() };
        rows.set(day, r);
      }
      addUsage(r.usage, b.u);
      const c = costOf(b.model, b.u).total;
      r.cost += c;
      r.costByModel[b.model] = (r.costByModel[b.model] ?? 0) + c;
      r.tokensByModel[b.model] = (r.tokensByModel[b.model] ?? 0) + totalTokens(b.u);
      r.ids.add(s.id);
    }
  }
  const keys = [...rows.keys()].sort();
  if (!keys.length) return [];
  // Time isn't per-model, so a model filter keeps whole sessions that used that model.
  // Sessions with no matching usage are skipped, as in applyFilters, so days sum to totals().
  const active = activeByDay(
    snapshot.sessions.filter(
      (s) => (!f.project || s.project === f.project) && s.buckets.some((b) => !f.model || b.model === f.model),
    ),
  );
  const start = parseDay(from ?? keys[0]);
  const end = parseDay(lastDay(snapshot));
  const out: DayRow[] = [];
  for (let d = start; d <= end; d = new Date(d.getTime() + DAY_MS)) {
    const k = dayKey(d);
    const r = rows.get(k);
    const activeMs = active.get(k) ?? 0;
    out.push(
      r
        ? { day: k, usage: r.usage, cost: r.cost, costByModel: r.costByModel, tokensByModel: r.tokensByModel, sessions: r.ids.size, activeMs }
        : { day: k, usage: emptyUsage(), cost: 0, costByModel: {}, tokensByModel: {}, sessions: 0, activeMs },
    );
  }
  return out;
}

export interface ModelRow {
  model: string;
  label: string;
  usage: Usage;
  cost: number;
  mainCalls: number;
  subCalls: number;
}

export function byModel(snapshot: Snapshot, f: Filters): ModelRow[] {
  const from = rangeStart(snapshot, f.range);
  const rows = new Map<string, ModelRow>();
  for (const s of snapshot.sessions) {
    if (f.project && s.project !== f.project) continue;
    for (const b of s.buckets) {
      if (from && b.h.slice(0, 10) < from) continue;
      if (f.model && b.model !== f.model) continue;
      let r = rows.get(b.model);
      if (!r) {
        r = { model: b.model, label: modelLabel(b.model), usage: emptyUsage(), cost: 0, mainCalls: 0, subCalls: 0 };
        rows.set(b.model, r);
      }
      addUsage(r.usage, b.u);
      r.cost += costOf(b.model, b.u).total;
      if (b.sub) r.subCalls += b.u.n;
      else r.mainCalls += b.u.n;
    }
  }
  const order = allModels(snapshot);
  return [...rows.values()].sort((a, b) => order.indexOf(a.model) - order.indexOf(b.model));
}

export interface ProjectRow {
  project: string;
  cost: number;
  usage: Usage;
  sessions: number;
  prompts: number;
  activeMs: number;
  lastActive: number;
}

export function byProject(views: View[]): ProjectRow[] {
  const rows = new Map<string, ProjectRow>();
  for (const v of views) {
    const p = v.session.project;
    let r = rows.get(p);
    if (!r) {
      r = { project: p, cost: 0, usage: emptyUsage(), sessions: 0, prompts: 0, activeMs: 0, lastActive: 0 };
      rows.set(p, r);
    }
    r.cost += v.cost;
    addUsage(r.usage, v.usage);
    r.sessions += 1;
    r.prompts += v.session.prompts;
    r.lastActive = Math.max(r.lastActive, v.session.end);
  }
  for (const r of rows.values())
    r.activeMs = sumValues(activeByDay(views.filter((v) => v.session.project === r.project).map((v) => v.session)));
  return [...rows.values()].sort((a, b) => b.cost - a.cost);
}

export interface ToolRow {
  name: string;
  label: string;
  group: string;
  calls: number;
  errors: number;
  sessions: number;
}

export function toolGroup(name: string): { group: string; label: string } {
  const m = /^mcp__(.+?)__(.+)$/.exec(name);
  if (!m) return { group: "Built-in", label: name };
  const server = m[1]
    .replace(/^claude_ai_/, "")
    .replace(/^plugin_[^_]+_/, "")
    .replace(/_/g, " ");
  return { group: `MCP · ${server}`, label: m[2] };
}

export function byTool(views: View[]): ToolRow[] {
  const rows = new Map<string, ToolRow>();
  for (const v of views) {
    for (const [name, st] of Object.entries(v.session.tools)) {
      let r = rows.get(name);
      if (!r) {
        r = { name, ...toolGroup(name), calls: 0, errors: 0, sessions: 0 };
        rows.set(name, r);
      }
      r.calls += st.calls;
      r.errors += st.errors;
      r.sessions += 1;
    }
  }
  return [...rows.values()].sort((a, b) => b.calls - a.calls);
}

/** [weekday 0=Sun..6][hour] API responses from filtered transcript buckets. */
export function weekHourCalls(snapshot: Snapshot, f: Filters): number[][] {
  const from = rangeStart(snapshot, f.range);
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const s of snapshot.sessions) {
    if (f.project && s.project !== f.project) continue;
    for (const b of s.buckets) {
      if (from && b.h.slice(0, 10) < from) continue;
      if (f.model && b.model !== f.model) continue;
      const d = parseDay(b.h.slice(0, 10));
      grid[d.getDay()][Number(b.h.slice(11, 13))] += b.u.n;
    }
  }
  return grid;
}

/** Long-view daily activity: prompts from history.jsonl, messages from stats-cache. */
export interface CalendarDay {
  day: string;
  prompts: number;
  messages: number;
}

export function calendar(snapshot: Snapshot): CalendarDay[] {
  const map = new Map<string, CalendarDay>();
  for (const [day, projects] of Object.entries(snapshot.prompts.byDay)) {
    map.set(day, { day, prompts: Object.values(projects).reduce((a, b) => a + b, 0), messages: 0 });
  }
  for (const d of snapshot.legacy.days) {
    const r = map.get(d.date) ?? { day: d.date, prompts: 0, messages: 0 };
    r.messages = d.messages;
    map.set(d.date, r);
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export function streaks(days: CalendarDay[], today: string) {
  const active = new Set(days.filter((d) => d.prompts > 0 || d.messages > 0).map((d) => d.day));
  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const k of [...active].sort()) {
    const d = parseDay(k);
    run = prev && d.getTime() - prev.getTime() <= DAY_MS + 3_600_000 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  let current = 0;
  let cursor = parseDay(today);
  if (!active.has(today)) cursor = new Date(cursor.getTime() - DAY_MS);
  while (active.has(dayKey(cursor))) {
    current += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return { current, longest, activeDays: active.size };
}

export function legacySummary(snapshot: Snapshot) {
  let cost = 0;
  let tokens = 0;
  const models = Object.entries(snapshot.legacy.modelTotals).map(([model, t]) => {
    const c = legacyCost(model, t);
    cost += c;
    tokens += t.in + t.out + t.cr + t.cw;
    return { model, label: modelLabel(model), cost: c, tokens: t.in + t.out + t.cr + t.cw, ...t };
  });
  return { cost, tokens, models: models.sort((a, b) => b.cost - a.cost) };
}
