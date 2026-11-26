/**
 * Reads Claude Code's local logs (~/.claude) and writes an aggregated snapshot to data/usage.json.
 *
 *   npm run ingest                       # default ~/.claude
 *   npm run ingest -- --claude-dir PATH  # another location
 *   npm run ingest -- --redact           # alias project names, drop session titles
 *
 * The merge is cumulative: sessions found in the transcripts replace their stored copy, and
 * sessions that Claude Code has since pruned are kept, so history outlives transcript cleanup.
 * Prompt text from history.jsonl is never written to the snapshot.
 *
 * stats-cache.json and history.jsonl are per machine, so their aggregates are stored per machine
 * (keyed by a hash of the hostname) and summed. Each run only replaces its own machine's entry.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import {
  type ActiveSpan,
  type Bucket,
  type LegacyDay,
  type LegacyStats,
  type MachineStats,
  type PromptStats,
  type Session,
  type Snapshot,
  type ToolStat,
  type Turn,
  type Usage,
  addUsage,
  emptyUsage,
} from "../lib/types";

const args = process.argv.slice(2);
const argValue = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const CLAUDE_DIR = argValue("--claude-dir") ?? path.join(os.homedir(), ".claude");
const REDACT = args.includes("--redact");
const OUT = path.resolve(__dirname, "..", "data", "usage.json");
/** A pause between events counts toward hands-on time up to this long. */
const GAP_CAP_MS = 45 * 60 * 1000;
const MAX_TURNS = 400;
const HOME = os.homedir().toLowerCase();
/** Stable, non-identifying id for this machine. */
const MACHINE_ID = crypto.createHash("sha256").update(os.hostname()).digest("hex").slice(0, 12);

const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localHour = (d: Date) => `${localDay(d)}T${pad(d.getHours())}`;

function projectName(cwd: string): string {
  if (!cwd) return "unknown";
  const lower = cwd.toLowerCase();
  if (lower.includes(`${path.sep}appdata${path.sep}local${path.sep}temp`) || lower.includes("/tmp/")) return "(temp dirs)";
  if (lower === HOME) return "~";
  return path.basename(cwd.replace(/[\\/]+$/, "")) || cwd;
}

/** Recursively list .jsonl transcripts under projects/. */
function listTranscripts(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTranscripts(p));
    else if (entry.name.endsWith(".jsonl")) out.push(p);
  }
  return out;
}

async function* readJsonl(file: string): AsyncGenerator<Record<string, unknown>> {
  const rl = readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      yield JSON.parse(line);
    } catch {
      // Partially written line; skip.
    }
  }
}

interface Draft {
  id: string;
  cwd: string;
  title: string | null;
  events: number[];
  entrypoint: string;
  version: string;
  gitBranch: string | null;
  prompts: number;
  effort: Record<string, number>;
  tools: Record<string, ToolStat>;
  toolNameById: Map<string, string>;
  seenToolUse: Set<string>;
  subagents: Record<string, number>;
  buckets: Map<string, Bucket>;
  seenMsg: Set<string>;
  turns: { t: number; ctx: number; out: number; model: string }[];
  reportedCostUSD: number | null;
}

const drafts = new Map<string, Draft>();

function draftFor(id: string): Draft {
  let d = drafts.get(id);
  if (!d) {
    d = {
      id,
      cwd: "",
      title: null,
      events: [],
      entrypoint: "",
      version: "",
      gitBranch: null,
      prompts: 0,
      effort: {},
      tools: {},
      toolNameById: new Map(),
      seenToolUse: new Set(),
      subagents: {},
      buckets: new Map(),
      seenMsg: new Set(),
      turns: [],
      reportedCostUSD: null,
    };
    drafts.set(id, d);
  }
  return d;
}

type Rec = Record<string, unknown>;
type Block = { type?: string; id?: string; name?: string; tool_use_id?: string; is_error?: boolean };

function usageFrom(raw: Rec | undefined): Usage {
  const u = emptyUsage();
  if (!raw) return u;
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  const cc = (raw.cache_creation ?? {}) as Rec;
  u.n = 1;
  u.in = num(raw.input_tokens);
  u.out = num(raw.output_tokens);
  u.think = num((raw.output_tokens_details as Rec | undefined)?.thinking_tokens);
  u.cr = num(raw.cache_read_input_tokens);
  const total = num(raw.cache_creation_input_tokens);
  const w5 = num(cc.ephemeral_5m_input_tokens);
  const w1h = num(cc.ephemeral_1h_input_tokens);
  // Older records lack the TTL split; treat the whole write as 5-minute.
  if (w5 + w1h === 0) u.cw5 = total;
  else {
    u.cw5 = w5;
    u.cw1h = w1h;
  }
  u.web = num((raw.server_tool_use as Rec | undefined)?.web_search_requests);
  return u;
}

async function ingestTranscript(file: string) {
  const isSubFile = file.includes(`${path.sep}subagents${path.sep}`);
  if (isSubFile) {
    const meta = file.replace(/\.jsonl$/, ".meta.json");
    if (fs.existsSync(meta)) {
      try {
        const m = JSON.parse(fs.readFileSync(meta, "utf8"));
        const parent = path.basename(path.dirname(path.dirname(file)));
        const d = draftFor(parent);
        const type = m.agentType ?? "unknown";
        d.subagents[type] = (d.subagents[type] ?? 0) + 1;
      } catch {
        /* ignore */
      }
    }
  }

  for await (const rec of readJsonl(file)) {
    const sessionId = (rec.sessionId ?? rec.session_id) as string | undefined;
    if (!sessionId) continue;
    const d = draftFor(sessionId);
    const type = rec.type as string;

    if (type === "ai-title" && typeof rec.aiTitle === "string") {
      d.title = rec.aiTitle;
      continue;
    }
    if (type === "cost-state" && typeof rec.totalCostUSD === "number") {
      // Cost-state is cumulative per session; keep the largest seen.
      d.reportedCostUSD = Math.max(d.reportedCostUSD ?? 0, rec.totalCostUSD);
      continue;
    }

    const ts = typeof rec.timestamp === "string" ? Date.parse(rec.timestamp) : NaN;
    if (type !== "assistant" && type !== "user") continue;
    if (!Number.isNaN(ts)) d.events.push(ts);
    if (!isSubFile && typeof rec.cwd === "string" && !d.cwd) d.cwd = rec.cwd;
    if (!isSubFile && typeof rec.entrypoint === "string") d.entrypoint = rec.entrypoint;
    if (!isSubFile && typeof rec.version === "string") d.version = rec.version;
    if (!isSubFile && typeof rec.gitBranch === "string" && rec.gitBranch !== "HEAD") d.gitBranch = rec.gitBranch;

    const message = rec.message as Rec | undefined;
    const content = message?.content;
    const blocks: Block[] = Array.isArray(content) ? (content as Block[]) : [];

    if (type === "user") {
      for (const b of blocks) {
        if (b.type === "tool_result" && b.is_error && b.tool_use_id) {
          const name = d.toolNameById.get(b.tool_use_id);
          if (name) d.tools[name].errors += 1;
        }
      }
      const isPrompt =
        !isSubFile &&
        !rec.isMeta &&
        !rec.isSidechain &&
        (typeof content === "string" || blocks.some((b) => b.type === "text")) &&
        !blocks.some((b) => b.type === "tool_result");
      if (isPrompt) d.prompts += 1;
      continue;
    }

    // Assistant record: one per content block, sharing message.id and usage.
    for (const b of blocks) {
      if (b.type === "tool_use" && b.id && b.name && !d.seenToolUse.has(b.id)) {
        d.seenToolUse.add(b.id);
        d.toolNameById.set(b.id, b.name);
        d.tools[b.name] ??= { calls: 0, errors: 0 };
        d.tools[b.name].calls += 1;
      }
    }

    const model = message?.model as string | undefined;
    const msgId = (message?.id as string | undefined) ?? (rec.requestId as string | undefined);
    if (!model || model === "<synthetic>" || !msgId || d.seenMsg.has(msgId) || Number.isNaN(ts)) continue;
    d.seenMsg.add(msgId);

    const u = usageFrom(message?.usage as Rec | undefined);
    const sub = isSubFile || rec.isSidechain === true;
    const hour = localHour(new Date(ts));
    const key = `${hour}|${model}|${sub ? 1 : 0}`;
    const bucket = d.buckets.get(key) ?? { h: hour, model, sub, u: emptyUsage() };
    addUsage(bucket.u, u);
    d.buckets.set(key, bucket);

    if (!sub) {
      if (typeof rec.effort === "string") d.effort[rec.effort] = (d.effort[rec.effort] ?? 0) + 1;
      d.turns.push({ t: ts, ctx: u.in + u.cr + u.cw5 + u.cw1h, out: u.out, model });
    }
  }
}

function finalize(d: Draft): Session | null {
  if (d.buckets.size === 0 && d.prompts === 0) return null;
  const events = d.events.sort((a, b) => a - b);
  if (events.length === 0) return null;
  // Each gap between events counts up to GAP_CAP_MS. Spans are merged, then split at
  // local midnight and tagged with their local day, so callers can take the union
  // across sessions (parallel sessions count once) without knowing the timezone.
  const spans: [number, number][] = [];
  for (let i = 1; i < events.length; i++) {
    const a = events[i - 1];
    const b = a + Math.min(events[i] - a, GAP_CAP_MS);
    if (b <= a) continue;
    const last = spans[spans.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else spans.push([a, b]);
  }
  const active: ActiveSpan[] = [];
  let activeMs = 0;
  for (const [start, b] of spans) {
    activeMs += b - start;
    let a = start;
    while (a < b) {
      const d = new Date(a);
      const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
      const end = Math.min(b, midnight);
      active.push([localDay(d), a, end]);
      a = end;
    }
  }
  const turns = d.turns.sort((a, b) => a.t - b.t);
  const step = Math.max(1, Math.ceil(turns.length / MAX_TURNS));
  const turnModels: string[] = [];
  const compact: Turn[] = [];
  turns.forEach((t, i) => {
    if (i % step !== 0 && i !== turns.length - 1) return;
    let mi = turnModels.indexOf(t.model);
    if (mi < 0) mi = turnModels.push(t.model) - 1;
    compact.push([t.t, t.ctx, t.out, mi]);
  });
  return {
    id: d.id,
    project: projectName(d.cwd),
    // Full paths reveal the local username and are not shown anywhere; keep only the project name.
    cwd: "",
    title: d.title,
    start: events[0],
    end: events[events.length - 1],
    activeMs,
    active,
    entrypoint: d.entrypoint || "unknown",
    version: d.version,
    gitBranch: d.gitBranch,
    prompts: d.prompts,
    effort: d.effort,
    tools: d.tools,
    subagents: d.subagents,
    buckets: [...d.buckets.values()].sort((a, b) => a.h.localeCompare(b.h)),
    turnModels,
    turns: compact,
    reportedCostUSD: d.reportedCostUSD,
  };
}

function readLegacy(): LegacyStats {
  const empty: LegacyStats = {
    from: null,
    to: null,
    days: [],
    modelTotals: {},
    hourCounts: {},
    totalSessions: 0,
    totalMessages: 0,
  };
  const file = path.join(CLAUDE_DIR, "stats-cache.json");
  if (!fs.existsSync(file)) return empty;
  const s = JSON.parse(fs.readFileSync(file, "utf8"));
  const tokens = new Map<string, Record<string, number>>();
  for (const t of s.dailyModelTokens ?? []) tokens.set(t.date, t.tokensByModel ?? {});
  const days: LegacyDay[] = (s.dailyActivity ?? []).map((a: Record<string, number | string>) => ({
    date: a.date as string,
    messages: (a.messageCount as number) ?? 0,
    sessions: (a.sessionCount as number) ?? 0,
    toolCalls: (a.toolCallCount as number) ?? 0,
    tokensByModel: tokens.get(a.date as string) ?? {},
  }));
  const modelTotals: LegacyStats["modelTotals"] = {};
  for (const [model, m] of Object.entries<Record<string, number>>(s.modelUsage ?? {})) {
    modelTotals[model] = {
      in: m.inputTokens ?? 0,
      out: m.outputTokens ?? 0,
      cr: m.cacheReadInputTokens ?? 0,
      cw: m.cacheCreationInputTokens ?? 0,
    };
  }
  return {
    from: days[0]?.date ?? null,
    to: days[days.length - 1]?.date ?? null,
    days,
    modelTotals,
    hourCounts: s.hourCounts ?? {},
    totalSessions: s.totalSessions ?? 0,
    totalMessages: s.totalMessages ?? 0,
  };
}

async function readPrompts(): Promise<PromptStats> {
  const byDay: Record<string, Record<string, number>> = {};
  const weekHour = Array.from({ length: 7 }, () => Array(24).fill(0));
  const file = path.join(CLAUDE_DIR, "history.jsonl");
  if (!fs.existsSync(file)) return { from: null, to: null, byDay, weekHour };
  for await (const rec of readJsonl(file)) {
    if (typeof rec.timestamp !== "number") continue;
    const d = new Date(rec.timestamp);
    const day = localDay(d);
    const project = projectName(typeof rec.project === "string" ? rec.project : "");
    byDay[day] ??= {};
    byDay[day][project] = (byDay[day][project] ?? 0) + 1;
    weekHour[d.getDay()][d.getHours()] += 1;
  }
  const days = Object.keys(byDay).sort();
  return { from: days[0] ?? null, to: days[days.length - 1] ?? null, byDay, weekHour };
}

const add = (to: Record<string, number>, from: Record<string, number>) => {
  for (const [k, v] of Object.entries(from)) to[k] = (to[k] ?? 0) + v;
};

function combineLegacy(all: LegacyStats[]): LegacyStats {
  const days = new Map<string, LegacyDay>();
  const out: LegacyStats = { from: null, to: null, days: [], modelTotals: {}, hourCounts: {}, totalSessions: 0, totalMessages: 0 };
  for (const l of all) {
    for (const d of l.days) {
      const r = days.get(d.date) ?? { date: d.date, messages: 0, sessions: 0, toolCalls: 0, tokensByModel: {} };
      r.messages += d.messages;
      r.sessions += d.sessions;
      r.toolCalls += d.toolCalls;
      add(r.tokensByModel, d.tokensByModel);
      days.set(d.date, r);
    }
    for (const [model, t] of Object.entries(l.modelTotals)) {
      const r = (out.modelTotals[model] ??= { in: 0, out: 0, cr: 0, cw: 0 });
      r.in += t.in;
      r.out += t.out;
      r.cr += t.cr;
      r.cw += t.cw;
    }
    add(out.hourCounts, l.hourCounts);
    out.totalSessions += l.totalSessions;
    out.totalMessages += l.totalMessages;
  }
  out.days = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  out.from = out.days[0]?.date ?? null;
  out.to = out.days[out.days.length - 1]?.date ?? null;
  return out;
}

function combinePrompts(all: PromptStats[]): PromptStats {
  const byDay: PromptStats["byDay"] = {};
  const weekHour = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const p of all) {
    for (const [day, projects] of Object.entries(p.byDay)) add((byDay[day] ??= {}), projects);
    p.weekHour.forEach((row, d) => row.forEach((v, h) => (weekHour[d][h] += v)));
  }
  const days = Object.keys(byDay).sort();
  return { from: days[0] ?? null, to: days[days.length - 1] ?? null, byDay, weekHour };
}

/**
 * Other machines' entries from the previous snapshot. A snapshot from before per-machine
 * tracking has its top-level stats carried over as an "imported" entry, which the next run on
 * the same platform (the machine that most likely wrote it) replaces with its own.
 */
function otherMachines(previous: Partial<Snapshot> | null): Record<string, MachineStats> {
  if (!previous) return {};
  let machines = previous.machines;
  if (!machines && previous.legacy && previous.prompts) {
    // Snapshots before per-machine tracking were only ever written on Windows.
    machines = {
      imported: { platform: "win32", generatedAt: previous.generatedAt ?? "", imported: true, legacy: previous.legacy, prompts: previous.prompts },
    };
  }
  const out: Record<string, MachineStats> = {};
  for (const [id, m] of Object.entries(machines ?? {})) {
    if (id === MACHINE_ID || (m.imported && m.platform === process.platform)) continue;
    out[id] = m;
  }
  return out;
}

function redact(snapshot: Snapshot): Snapshot {
  const alias = new Map<string, string>();
  const nameFor = (p: string) => {
    if (!alias.has(p)) alias.set(p, `Project ${String.fromCharCode(65 + (alias.size % 26))}${alias.size >= 26 ? Math.floor(alias.size / 26) : ""}`);
    return alias.get(p)!;
  };
  for (const s of snapshot.sessions) {
    s.project = nameFor(s.project);
    s.cwd = "";
    s.title = null;
    s.gitBranch = null;
  }
  const allPrompts = [snapshot.prompts, ...Object.values(snapshot.machines ?? {}).map((m) => m.prompts)];
  for (const prompts of allPrompts) {
    for (const day of Object.values(prompts.byDay)) {
      for (const p of Object.keys(day)) {
        const v = day[p];
        delete day[p];
        const a = nameFor(p);
        day[a] = (day[a] ?? 0) + v;
      }
    }
  }
  snapshot.redacted = true;
  return snapshot;
}

async function main() {
  const files = listTranscripts(path.join(CLAUDE_DIR, "projects"));
  // Main transcripts first so cwd/entrypoint come from the parent session.
  files.sort((a, b) => Number(a.includes(`${path.sep}subagents${path.sep}`)) - Number(b.includes(`${path.sep}subagents${path.sep}`)));
  for (const f of files) await ingestTranscript(f);

  const fresh = [...drafts.values()].map(finalize).filter((s): s is Session => s !== null);

  let prevSnapshot: Partial<Snapshot> | null = null;
  if (fs.existsSync(OUT)) {
    try {
      prevSnapshot = JSON.parse(fs.readFileSync(OUT, "utf8")) as Partial<Snapshot>;
    } catch {
      console.warn("Existing snapshot unreadable; starting fresh.");
    }
  }
  const previous = prevSnapshot?.sessions ?? [];
  const merged = new Map(previous.map((s) => [s.id, s]));
  for (const s of fresh) merged.set(s.id, s);
  const sessions = [...merged.values()].sort((a, b) => a.start - b.start);

  const generatedAt = new Date().toISOString();
  const machines: Record<string, MachineStats> = {
    ...otherMachines(prevSnapshot),
    [MACHINE_ID]: { platform: process.platform, generatedAt, legacy: readLegacy(), prompts: await readPrompts() },
  };
  let snapshot: Snapshot = {
    version: 1,
    generatedAt,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    sessions,
    legacy: combineLegacy(Object.values(machines).map((m) => m.legacy)),
    prompts: combinePrompts(Object.values(machines).map((m) => m.prompts)),
    machines,
    redacted: false,
  };
  if (REDACT) snapshot = redact(snapshot);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  // Write-then-rename so a concurrent run (session hook + daily sync) never sees a half-written file.
  const tmp = `${OUT}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(snapshot));
  fs.renameSync(tmp, OUT);

  const calls = sessions.reduce((n, s) => n + s.buckets.reduce((m, b) => m + b.u.n, 0), 0);
  const kept = sessions.length - fresh.length;
  console.log(
    `Wrote ${path.relative(process.cwd(), OUT)}: ${sessions.length} sessions (${fresh.length} from transcripts, ${kept} retained), ` +
      `${calls} API responses, ${Object.keys(machines).length} machine(s), ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB${REDACT ? ", redacted" : ""}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
