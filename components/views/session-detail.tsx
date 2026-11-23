"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useData } from "../data-context";
import { ContextCurve } from "../charts";
import { BarList, Card, DataTable, SegmentedBar, StatTile } from "../ui";
import { modelColor, seriesSlot, toolGroup } from "@/lib/aggregate";
import { fmtDateTime, fmtDuration, fmtNum, fmtPct, fmtUSD } from "@/lib/format";
import { costOf, modelLabel } from "@/lib/pricing";
import { type Usage, addUsage, emptyUsage, inputSide, totalTokens } from "@/lib/types";

export function SessionDetailView({ id }: { id: string }) {
  const { snapshot } = useData();
  const s = snapshot.sessions.find((x) => x.id === id);

  const models = useMemo(() => {
    const m = new Map<string, Usage>();
    for (const b of s?.buckets ?? []) addUsage(m.get(b.model) ?? m.set(b.model, emptyUsage()).get(b.model)!, b.u);
    return [...m.entries()].map(([model, u]) => ({ model, u, cost: costOf(model, u).total })).sort((a, b) => b.cost - a.cost);
  }, [s]);

  if (!s) {
    return (
      <Card title="Session not found">
        <Link href="/sessions" className="text-accent hover:underline">
          Back to sessions
        </Link>
      </Card>
    );
  }

  const usage = models.reduce((a, m) => addUsage(a, m.u), emptyUsage());
  const cost = models.reduce((a, m) => a + m.cost, 0);
  const turns = s.turns.map((t, i) => ({ i: i + 1, t: t[0], ctx: t[1], out: t[2], model: s.turnModels[t[3]] }));
  const peak = turns.reduce((a, t) => Math.max(a, t.ctx), 0);
  const tools = Object.entries(s.tools).sort((a, b) => b[1].calls - a[1].calls);
  const subagents = Object.entries(s.subagents);

  return (
    <>
      <div className="mb-6">
        <Link href="/sessions" className="text-[13px] text-muted hover:text-ink">
          ← Sessions
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{s.title ?? `Session ${s.id.slice(0, 8)}`}</h1>
        <p className="mt-1 text-[13px] text-muted">
          {s.project} · {fmtDateTime(s.start)} → {fmtDateTime(s.end)} · {s.entrypoint} {s.version && `v${s.version}`}
          {s.gitBranch && ` · ${s.gitBranch}`}
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile
            label="Estimated cost"
            value={fmtUSD(cost, { precise: true })}
            sub={s.reportedCostUSD != null ? `Claude Code tallied ${fmtUSD(s.reportedCostUSD, { precise: true })} in-session` : undefined}
          />
          <StatTile label="Tokens" value={fmtNum(totalTokens(usage))} sub={`${fmtPct(inputSide(usage) ? usage.cr / inputSide(usage) : 0)} cache hits`} />
          <StatTile label="Hands-on time" value={fmtDuration(s.activeMs)} sub={`${s.prompts} prompts · ${fmtNum(usage.n)} API calls`} />
          <StatTile label="Peak context" value={fmtNum(peak)} sub="largest single request" />
        </div>

        <Card title="Context growth" subtitle="Input-side tokens per main-thread request; drops usually mean compaction or /clear">
          <ContextCurve data={turns} />
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Models">
            <SegmentedBar format={(n) => fmtUSD(n, { precise: true })} parts={models.map((m) => ({ label: modelLabel(m.model), value: m.cost, color: modelColor(snapshot, m.model) }))} />
            <div className="mt-4">
              <DataTable
                columns={["Model", "Calls", "Output", "Cache read", "Cost"]}
                rows={models.map((m) => [modelLabel(m.model), m.u.n, fmtNum(m.u.out), fmtNum(m.u.cr), fmtUSD(m.cost, { precise: true })])}
              />
            </div>
          </Card>
          <Card title="Tools" subtitle={subagents.length ? `Subagents: ${subagents.map(([k, n]) => `${k} ×${n}`).join(", ")}` : undefined}>
            {tools.length ? (
              <BarList
                format={fmtNum}
                rows={tools.slice(0, 15).map(([name, t]) => ({
                  key: name,
                  label: toolGroup(name).label,
                  value: t.calls,
                  color: name.startsWith("mcp__") ? seriesSlot(2) : seriesSlot(0),
                  aside: t.errors ? <span className="mr-2 text-[11px] text-muted">{t.errors} err</span> : null,
                }))}
              />
            ) : (
              <p className="text-sm text-muted">No tool calls.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
