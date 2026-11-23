"use client";

import { useMemo } from "react";
import { useData } from "../data-context";
import { PageHeader } from "../shell";
import { BarList, Card, DataTable, Empty, StatTile } from "../ui";
import { byTool, seriesSlot } from "@/lib/aggregate";
import { fmtNum, fmtPct } from "@/lib/format";

export function ToolsView() {
  const { views } = useData();
  const tools = useMemo(() => byTool(views), [views]);
  const groups = useMemo(() => {
    const m = new Map<string, { calls: number; errors: number; tools: number }>();
    for (const t of tools) {
      const g = m.get(t.group) ?? { calls: 0, errors: 0, tools: 0 };
      g.calls += t.calls;
      g.errors += t.errors;
      g.tools += 1;
      m.set(t.group, g);
    }
    return [...m.entries()].sort((a, b) => b[1].calls - a[1].calls);
  }, [tools]);

  const calls = tools.reduce((a, t) => a + t.calls, 0);
  const errors = tools.reduce((a, t) => a + t.errors, 0);
  const mcpCalls = tools.filter((t) => t.group !== "Built-in").reduce((a, t) => a + t.calls, 0);
  const flaky = tools.filter((t) => t.calls >= 3 && t.errors > 0).sort((a, b) => b.errors / b.calls - a.errors / a.calls);

  return (
    <>
      <PageHeader title="Tools">What Claude reached for, which MCP servers earned their keep, and where calls failed.</PageHeader>
      {tools.length === 0 ? (
        <Card title="Nothing here">
          <Empty />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile label="Tool calls" value={fmtNum(calls)} sub={`${fmtNum(calls / Math.max(views.length, 1))} per session`} />
            <StatTile label="Distinct tools" value={fmtNum(tools.length)} />
            <StatTile label="MCP share" value={fmtPct(calls ? mcpCalls / calls : 0)} sub={`${fmtNum(mcpCalls)} calls`} />
            <StatTile label="Error rate" value={fmtPct(calls ? errors / calls : 0, 1)} sub={`${fmtNum(errors)} failed results`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card
              title="Most-used tools"
              subtitle="Top 20 by calls"
              table={{ columns: ["Tool", "Source", "Calls", "Errors", "Sessions"], rows: tools.map((t) => [t.label, t.group, t.calls, t.errors, t.sessions]) }}
            >
              <BarList
                format={fmtNum}
                rows={tools.slice(0, 20).map((t) => ({
                  key: t.name,
                  label: (
                    <>
                      {t.label}
                      {t.group !== "Built-in" && <span className="ml-2 text-[11px] text-muted">{t.group.replace("MCP · ", "")}</span>}
                    </>
                  ),
                  value: t.calls,
                  color: t.group === "Built-in" ? seriesSlot(0) : seriesSlot(2),
                  tip: (
                    <>
                      <b>{t.name}</b>
                      <br />
                      {fmtNum(t.calls)} calls · {t.errors} errors · {t.sessions} sessions
                    </>
                  ),
                }))}
              />
              <div className="mt-4 flex gap-4 text-[12px] text-ink-2">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: seriesSlot(0) }} /> Built-in
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: seriesSlot(2) }} /> MCP
                </span>
              </div>
            </Card>
            <div className="space-y-4">
              <Card title="By source" subtitle="Built-in tools vs each MCP server">
                <BarList
                  format={fmtNum}
                  rows={groups.map(([g, s]) => ({
                    key: g,
                    label: g,
                    value: s.calls,
                    color: g === "Built-in" ? seriesSlot(0) : seriesSlot(2),
                    tip: `${s.tools} tools · ${s.errors} errors`,
                  }))}
                />
              </Card>
              <Card title="Where calls failed" subtitle="Tools with 3+ calls, by error rate">
                {flaky.length ? (
                  <DataTable columns={["Tool", "Errors", "Rate"]} rows={flaky.slice(0, 10).map((t) => [t.label, `${t.errors}/${t.calls}`, fmtPct(t.errors / t.calls)])} />
                ) : (
                  <Empty>No failing tools. Splendid.</Empty>
                )}
              </Card>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
