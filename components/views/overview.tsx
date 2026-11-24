"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useData } from "../data-context";
import { PageHeader } from "../shell";
import { ActivityCalendar, StackedDaily } from "../charts";
import { BarList, Card, Empty, SegmentedBar, Sparkline, StatTile } from "../ui";
import {
  allModels,
  allProjects,
  byModel,
  byProject,
  calendar,
  daily,
  dayKey,
  legacySummary,
  modelColor,
  seriesSlot,
  streaks,
  totals,
} from "@/lib/aggregate";
import { fmtDay, fmtDuration, fmtNum, fmtPct, fmtUSD } from "@/lib/format";
import { modelLabel } from "@/lib/pricing";
import { totalTokens } from "@/lib/types";

const HOUR_MS = 3_600_000;
const RANGE_LABEL ={ "7d": "last 7 days", "14d": "last 14 days", "30d": "last 30 days", all: "all recorded sessions" };

export function OverviewView() {
  const { snapshot, filters, views } = useData();
  const t = useMemo(() => totals(views), [views]);
  const days = useMemo(() => daily(snapshot, filters), [snapshot, filters]);
  const models = useMemo(() => byModel(snapshot, filters), [snapshot, filters]);
  const projects = useMemo(() => byProject(views), [views]);
  const cal = useMemo(() => calendar(snapshot), [snapshot]);
  const today = dayKey(new Date(snapshot.generatedAt));
  const streak = useMemo(() => streaks(cal, today), [cal, today]);
  const legacy = useMemo(() => legacySummary(snapshot), [snapshot]);
  const projectOrder = allProjects(snapshot);

  const modelSeries = allModels(snapshot)
    .filter((m) => models.some((r) => r.model === m))
    .map((m) => ({ key: m, label: modelLabel(m), color: modelColor(snapshot, m) }));
  const costRows = days.map((d) => ({ day: d.day, ...d.costByModel }));
  const busiest = days.reduce((a, d) => (d.cost > (a?.cost ?? -1) ? d : a), days[0]);
  const longestDay = days.reduce((a, d) => (d.activeMs > (a?.activeMs ?? -1) ? d : a), days[0]);
  // Claude Code's own per-session meter also counts background calls that never reach the transcript.
  const metered = views.filter((v) => v.session.reportedCostUSD != null);
  const meteredEst = metered.reduce((a, v) => a + v.cost, 0);
  const meteredCC = metered.reduce((a, v) => a + (v.session.reportedCostUSD ?? 0), 0);
  const firstSession = snapshot.sessions[0]?.start;

  return (
    <>
      <PageHeader title="Overview">
        API-equivalent spend and activity across {RANGE_LABEL[filters.range]}
        {filters.project ? ` in ${filters.project}` : ""}
        {filters.model ? ` on ${modelLabel(filters.model)}` : ""}.
        {firstSession && ` Detailed transcripts start ${new Date(firstSession).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.`}
      </PageHeader>

      {views.length === 0 ? (
        <Card title="Nothing here">
          <Empty />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
            <StatTile hero label="Estimated cost" value={fmtUSD(t.cost)} sub={`${fmtUSD(t.cost / Math.max(t.activeDays, 1))} per active day · busiest ${busiest ? `${fmtDay(busiest.day)} (${fmtUSD(busiest.cost)})` : "—"}`}>
              <Sparkline values={days.map((d) => d.cost)} />
              {!filters.model && metered.length > 0 && meteredCC > meteredEst && (
                <p className="mt-3 border-t border-line pt-3 text-[12px] text-muted">
                  Claude Code&apos;s own meter reads <span className="text-ink-2">{fmtUSD(meteredCC)}</span> for the {metered.length} sessions
                  that record it, {fmtPct(meteredCC / meteredEst - 1)} above the transcript estimate. The difference is background calls
                  (titles, compaction, helpers) that never reach the transcript.
                </p>
              )}
            </StatTile>
            <div className="grid grid-cols-2 gap-4">
              <StatTile label="Tokens processed" value={fmtNum(totalTokens(t.usage))} sub={`${fmtNum(t.usage.out)} output · ${fmtNum(t.usage.think)} thinking`} />
              <StatTile label="Cache hit rate" value={fmtPct(t.cacheHitRate, 1)} sub={`saved ≈ ${fmtUSD(t.cacheSavings)} vs. uncached`} />
              <StatTile label="Sessions" value={fmtNum(t.sessions)} sub={`${fmtNum(t.prompts)} prompts · ${fmtNum(t.usage.n)} API calls`} />
              <StatTile label="Hands-on time" value={fmtDuration(t.activeMs)} sub={`${t.activeDays} active days · idle gaps >30m excluded`} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Link href="/streaks" className="group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <StatTile
                label="Current streak"
                value={`${streak.current} day${streak.current === 1 ? "" : "s"}`}
                sub={<span className="group-hover:text-accent">longest {streak.longest} days · see streaks →</span>}
              />
            </Link>
            <StatTile label="Tool calls" value={fmtNum(t.toolCalls)} sub={`${fmtPct(t.toolCalls ? t.toolErrors / t.toolCalls : 0, 1)} returned errors`} />
            <StatTile label="Subagent runs" value={fmtNum(t.subagentRuns)} sub="Explore, Plan, web-fetch…" />
            <StatTile label="Cost per prompt" value={fmtUSD(t.prompts ? t.cost / t.prompts : 0)} sub={`${fmtNum(t.prompts ? totalTokens(t.usage) / t.prompts : 0)} tokens each`} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Card
              title="Daily cost by model"
              subtitle="Stacked API-equivalent spend per day"
              table={{
                columns: ["Day", ...modelSeries.map((s) => s.label), "Total"],
                rows: days.map((d) => [fmtDay(d.day), ...modelSeries.map((s) => fmtUSD(d.costByModel[s.key] ?? 0)), fmtUSD(d.cost)]),
              }}
            >
              <StackedDaily data={costRows} series={modelSeries} format={(n) => fmtUSD(n)} />
            </Card>
            <div className="space-y-4">
              <Card title="Where the money goes" subtitle="Share of estimated cost by token type">
                <SegmentedBar
                  format={(n) => fmtUSD(n)}
                  parts={[
                    { label: "Cache writes", value: t.cacheWriteCost, color: seriesSlot(0) },
                    { label: "Cache reads", value: t.cacheReadCost, color: seriesSlot(2) },
                    { label: "Output", value: t.outputCost, color: seriesSlot(1) },
                    { label: "Fresh input", value: t.inputCost, color: seriesSlot(6) },
                  ]}
                />
              </Card>
              <Card title="Model mix" subtitle="Share of estimated cost">
                <SegmentedBar
                  format={(n) => fmtUSD(n)}
                  parts={models.map((m) => ({ label: m.label, value: m.cost, color: modelColor(snapshot, m.model) }))}
                />
              </Card>
            </div>
          </div>

          <Card
            title="Coding time per day"
            subtitle={`Hands-on time by day · ${fmtDuration(t.activeMs / Math.max(t.activeDays, 1))} average per active day · longest ${longestDay ? `${fmtDay(longestDay.day)} (${fmtDuration(longestDay.activeMs)})` : "—"}`}
            table={{
              columns: ["Day", "Coding time", "Sessions"],
              rows: days.map((d) => [fmtDay(d.day), fmtDuration(d.activeMs), d.sessions]),
            }}
          >
            <StackedDaily
              data={days.map((d) => ({ day: d.day, hours: d.activeMs / HOUR_MS }))}
              series={[{ key: "hours", label: "Coding time", color: seriesSlot(3) }]}
              format={(h) => fmtDuration(h * HOUR_MS)}
              height={220}
            />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              title="Top projects"
              subtitle="By estimated cost"
              action={
                <Link href="/projects" className="text-[13px] text-accent hover:underline">
                  All projects →
                </Link>
              }
            >
              <BarList
                format={(n) => fmtUSD(n)}
                rows={projects.slice(0, 6).map((p) => ({
                  key: p.project,
                  label: p.project,
                  value: p.cost,
                  color: seriesSlot(Math.max(0, projectOrder.indexOf(p.project))),
                  tip: (
                    <>
                      <b>{p.project}</b>
                      <br />
                      {fmtUSD(p.cost)} · {p.sessions} sessions · {fmtNum(totalTokens(p.usage))} tokens
                    </>
                  ),
                }))}
              />
            </Card>
            <Card title="Earlier period" subtitle={snapshot.legacy.from ? `Aggregates from Claude Code's stats cache, ${fmtDay(snapshot.legacy.from)} – ${fmtDay(snapshot.legacy.to!)}` : "No stats cache found"}>
              {snapshot.legacy.from ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-[12px] text-muted">Est. cost</p>
                      <p className="text-xl font-semibold text-ink">{fmtUSD(legacy.cost)}</p>
                    </div>
                    <div>
                      <p className="text-[12px] text-muted">Sessions</p>
                      <p className="text-xl font-semibold text-ink">{fmtNum(snapshot.legacy.totalSessions)}</p>
                    </div>
                    <div>
                      <p className="text-[12px] text-muted">Messages</p>
                      <p className="text-xl font-semibold text-ink">{fmtNum(snapshot.legacy.totalMessages)}</p>
                    </div>
                  </div>
                  <BarList
                    format={(n) => fmtUSD(n)}
                    rows={legacy.models.map((m, i) => ({
                      key: m.model,
                      label: m.label,
                      value: m.cost,
                      color: seriesSlot(4 + i),
                      tip: (
                        <>
                          <b>{m.label}</b>
                          <br />
                          {fmtNum(m.tokens)} tokens · {fmtNum(m.out)} output
                        </>
                      ),
                    }))}
                  />
                  <p className="text-[12px] text-muted">Not affected by filters. Transcripts for this period were pruned, so only totals survive.</p>
                </div>
              ) : (
                <Empty>No earlier aggregates.</Empty>
              )}
            </Card>
          </div>

          <Card title="Activity calendar" subtitle={`Prompts per day since ${snapshot.prompts.from ? fmtDay(snapshot.prompts.from) : "—"} · ${streak.activeDays} active days · not affected by filters`}>
            <ActivityCalendar days={cal} today={today} />
          </Card>
        </div>
      )}
    </>
  );
}
