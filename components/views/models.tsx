"use client";

import { useMemo } from "react";
import { useData } from "../data-context";
import { PageHeader } from "../shell";
import { StackedDaily } from "../charts";
import { BarList, Card, DataTable, Empty, SegmentedBar, Swatch } from "../ui";
import { allModels, byModel, daily, legacySummary, modelColor, seriesSlot } from "@/lib/aggregate";
import { fmtDay, fmtNum, fmtPct, fmtUSD } from "@/lib/format";
import { PRICING_AS_OF, costOf, modelLabel } from "@/lib/pricing";
import { totalTokens } from "@/lib/types";

export function ModelsView() {
  const { snapshot, filters, views } = useData();
  const rows = useMemo(() => byModel(snapshot, filters), [snapshot, filters]);
  const days = useMemo(() => daily(snapshot, filters), [snapshot, filters]);
  const legacy = useMemo(() => legacySummary(snapshot), [snapshot]);

  const series = allModels(snapshot)
    .filter((m) => rows.some((r) => r.model === m))
    .map((m) => ({ key: m, label: modelLabel(m), color: modelColor(snapshot, m) }));

  const effort = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of views) for (const [k, n] of Object.entries(v.session.effort)) m.set(k, (m.get(k) ?? 0) + n);
    const levels = ["low", "medium", "high", "xhigh", "max"];
    return [...m.entries()].sort((a, b) => levels.indexOf(a[0]) - levels.indexOf(b[0]));
  }, [views]);

  const subagents = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of views) for (const [k, n] of Object.entries(v.session.subagents)) m.set(k, (m.get(k) ?? 0) + n);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [views]);

  const totalCalls = rows.reduce((a, r) => a + r.mainCalls + r.subCalls, 0);
  const subCalls = rows.reduce((a, r) => a + r.subCalls, 0);

  return (
    <>
      <PageHeader title="Models & effort">Which models carried the work, what each cost, and how hard they were asked to think.</PageHeader>
      {rows.length === 0 ? (
        <Card title="Nothing here">
          <Empty />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {rows.map((r) => {
              const c = costOf(r.model, r.usage);
              return (
                <section key={r.model} className="rise rounded-2xl border border-line bg-surface-1 p-4">
                  <p className="flex items-center gap-2 text-[13px] text-muted">
                    <Swatch color={modelColor(snapshot, r.model)} />
                    {r.label}
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">{fmtUSD(r.cost)}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-y-1 text-[12px]">
                    <dt className="text-muted">API calls</dt>
                    <dd className="tabular text-right text-ink-2">{fmtNum(r.mainCalls + r.subCalls)}</dd>
                    <dt className="text-muted">Tokens</dt>
                    <dd className="tabular text-right text-ink-2">{fmtNum(totalTokens(r.usage))}</dd>
                    <dt className="text-muted">Output</dt>
                    <dd className="tabular text-right text-ink-2">{fmtNum(r.usage.out)}</dd>
                    <dt className="text-muted">Cache saved</dt>
                    <dd className="tabular text-right text-ink-2">{fmtUSD(c.cacheSavings)}</dd>
                    <dt className="text-muted">Via subagents</dt>
                    <dd className="tabular text-right text-ink-2">{fmtPct(r.subCalls / Math.max(r.mainCalls + r.subCalls, 1))}</dd>
                  </dl>
                </section>
              );
            })}
          </div>

          <Card
            title="Daily tokens by model"
            table={{
              columns: ["Day", ...series.map((s) => s.label)],
              rows: days.map((d) => [fmtDay(d.day), ...series.map((s) => fmtNum(d.tokensByModel[s.key] ?? 0))]),
            }}
          >
            <StackedDaily data={days.map((d) => ({ day: d.day, ...d.tokensByModel }))} series={series} format={fmtNum} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Effort levels" subtitle="Main-thread API calls by requested effort">
              {effort.length ? (
                <SegmentedBar format={(n) => `${fmtNum(n)} calls`} parts={effort.map(([k, n], i) => ({ label: k, value: n, color: seriesSlot(i) }))} />
              ) : (
                <Empty>No effort data.</Empty>
              )}
            </Card>
            <Card title="Main thread vs subagents" subtitle="Share of API calls">
              <SegmentedBar
                format={(n) => `${fmtNum(n)} calls`}
                parts={[
                  { label: "Main thread", value: totalCalls - subCalls, color: seriesSlot(0) },
                  { label: "Subagents", value: subCalls, color: seriesSlot(1) },
                ]}
              />
            </Card>
            <Card title="Subagent types" subtitle="Runs launched">
              {subagents.length ? (
                <BarList format={fmtNum} rows={subagents.map(([k, n]) => ({ key: k, label: k, value: n }))} />
              ) : (
                <Empty>No subagents in range.</Empty>
              )}
            </Card>
          </div>

          <Card title="Token & cost breakdown" subtitle={`List prices as of ${PRICING_AS_OF}; cache writes priced by TTL (5m 1.25×, 1h 2× input)`}>
            <DataTable
              columns={["Model", "Fresh input", "Cache write 5m", "Cache write 1h", "Cache read", "Output", "Thinking", "Cost"]}
              rows={rows.map((r) => [
                r.label,
                fmtNum(r.usage.in),
                fmtNum(r.usage.cw5),
                fmtNum(r.usage.cw1h),
                fmtNum(r.usage.cr),
                fmtNum(r.usage.out),
                fmtNum(r.usage.think),
                fmtUSD(r.cost),
              ])}
            />
          </Card>

          {legacy.models.length > 0 && (
            <Card title="Earlier models" subtitle={`Stats cache totals, ${fmtDay(snapshot.legacy.from!)} – ${fmtDay(snapshot.legacy.to!)} · not affected by filters`}>
              <DataTable
                columns={["Model", "Input", "Cache write", "Cache read", "Output", "Est. cost"]}
                rows={legacy.models.map((m) => [m.label, fmtNum(m.in), fmtNum(m.cw), fmtNum(m.cr), fmtNum(m.out), fmtUSD(m.cost)])}
              />
            </Card>
          )}
        </div>
      )}
    </>
  );
}
