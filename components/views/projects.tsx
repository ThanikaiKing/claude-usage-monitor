"use client";

import { useMemo } from "react";
import { useData } from "../data-context";
import { PageHeader } from "../shell";
import { StackedDaily } from "../charts";
import { BarList, Card, DataTable, Empty } from "../ui";
import { allProjects, byProject, daily, rangeStart, seriesSlot } from "@/lib/aggregate";
import { fmtDateTime, fmtDay, fmtDuration, fmtNum, fmtUSD } from "@/lib/format";
import { costOf } from "@/lib/pricing";
import { totalTokens } from "@/lib/types";

export function ProjectsView() {
  const { snapshot, filters, setFilters, views } = useData();
  const rows = useMemo(() => byProject(views), [views]);
  const order = useMemo(() => allProjects(snapshot), [snapshot]);
  const color = (p: string) => seriesSlot(Math.max(0, order.indexOf(p)));

  // Daily cost stacked by project: top 7 keep their colour, the rest fold into "Other".
  const top = useMemo(() => order.filter((p) => rows.some((r) => r.project === p)).slice(0, 7), [order, rows]);
  const days = useMemo(() => daily(snapshot, { ...filters, project: null }), [snapshot, filters]);
  const stacked = useMemo(() => {
    const from = rangeStart(snapshot, filters.range);
    const map = new Map(days.map((d) => [d.day, { day: d.day } as Record<string, number | string>]));
    for (const v of views) {
      for (const b of v.session.buckets) {
        const day = b.h.slice(0, 10);
        if ((from && day < from) || (filters.model && b.model !== filters.model)) continue;
        const row = map.get(day);
        if (!row) continue;
        const key = top.includes(v.session.project) ? v.session.project : "Other";
        row[key] = Number(row[key] ?? 0) + costOf(b.model, b.u).total;
      }
    }
    return [...map.values()];
  }, [days, views, top, snapshot, filters]);
  const series = [
    ...top.map((p) => ({ key: p, label: p, color: color(p) })),
    ...(rows.length > top.length ? [{ key: "Other", label: "Other", color: "var(--text-muted)" }] : []),
  ];

  const promptTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const day of Object.values(snapshot.prompts.byDay)) for (const [p, n] of Object.entries(day)) m.set(p, (m.get(p) ?? 0) + n);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [snapshot]);

  return (
    <>
      <PageHeader title="Projects">Spend and effort per working directory. Click a project to filter the whole dashboard to it.</PageHeader>
      {rows.length === 0 ? (
        <Card title="Nothing here">
          <Empty />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <Card title="Cost by project" subtitle="Estimated, current filters">
              <BarList
                format={(n) => fmtUSD(n)}
                rows={rows.map((r) => ({
                  key: r.project,
                  label: (
                    <button type="button" className="hover:underline" onClick={() => setFilters({ project: filters.project === r.project ? null : r.project })}>
                      {r.project}
                    </button>
                  ),
                  value: r.cost,
                  color: color(r.project),
                  tip: (
                    <>
                      <b>{r.project}</b>
                      <br />
                      {fmtUSD(r.cost)} · {r.sessions} sessions · {fmtNum(r.prompts)} prompts
                    </>
                  ),
                }))}
              />
            </Card>
            <Card title="Daily cost by project" subtitle="Top seven projects; the rest fold into Other">
              <StackedDaily data={stacked} series={series} format={(n) => fmtUSD(n)} height={300} />
            </Card>
          </div>

          <Card title="Project details">
            <DataTable
              columns={["Project", "Cost", "Tokens", "Sessions", "Prompts", "Hands-on", "Last active"]}
              rows={rows.map((r) => [r.project, fmtUSD(r.cost), fmtNum(totalTokens(r.usage)), r.sessions, r.prompts, fmtDuration(r.activeMs), fmtDateTime(r.lastActive)])}
            />
          </Card>

          <Card
            title="Prompts by project, long view"
            subtitle={`From history.jsonl since ${snapshot.prompts.from ? fmtDay(snapshot.prompts.from) : "—"} · not affected by filters`}
          >
            <BarList format={fmtNum} color="var(--series-1)" rows={promptTotals.slice(0, 15).map(([p, n]) => ({ key: p, label: p, value: n }))} />
          </Card>
        </div>
      )}
    </>
  );
}
