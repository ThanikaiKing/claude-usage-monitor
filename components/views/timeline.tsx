"use client";

import { useMemo } from "react";
import { useData } from "../data-context";
import { PageHeader } from "../shell";
import { ActivityCalendar, Columns, StackedDaily, WeekHourHeatmap } from "../charts";
import { Card, Empty } from "../ui";
import { calendar, daily, dayKey, seriesSlot, weekHourCalls } from "@/lib/aggregate";
import { fmtDay, fmtFull, fmtNum, fmtUSD } from "@/lib/format";

const TOKEN_SERIES = [
  { key: "cr", label: "Cache reads", color: seriesSlot(2) },
  { key: "cw", label: "Cache writes", color: seriesSlot(0) },
  { key: "in", label: "Fresh input", color: seriesSlot(6) },
  { key: "out", label: "Output", color: seriesSlot(1) },
];

export function TimelineView() {
  const { snapshot, filters, views } = useData();
  const days = useMemo(() => daily(snapshot, filters), [snapshot, filters]);
  const grid = useMemo(() => weekHourCalls(snapshot, filters), [snapshot, filters]);
  const cal = useMemo(() => calendar(snapshot), [snapshot]);

  const tokenRows = days.map((d) => ({ day: d.day, cr: d.usage.cr, cw: d.usage.cw5 + d.usage.cw1h, in: d.usage.in, out: d.usage.out }));
  const outRows = days.map((d) => ({ day: d.day, out: d.usage.out }));

  const lengths = useMemo(() => {
    const bins = [
      { label: "<5m", max: 5 },
      { label: "5–15m", max: 15 },
      { label: "15–30m", max: 30 },
      { label: "30–60m", max: 60 },
      { label: "1–2h", max: 120 },
      { label: "2h+", max: Infinity },
    ].map((b) => ({ ...b, value: 0 }));
    for (const v of views) {
      const m = v.session.activeMs / 60_000;
      bins.find((b) => m < b.max)!.value += 1;
    }
    return bins;
  }, [views]);

  const legacyRows = snapshot.legacy.days.map((d) => ({ day: d.date, messages: d.messages, toolCalls: d.toolCalls }));

  return (
    <>
      <PageHeader title="Timeline">When the work happens, and how the token mix shifts day to day.</PageHeader>
      {days.length === 0 ? (
        <Card title="Nothing here">
          <Empty />
        </Card>
      ) : (
        <div className="space-y-4">
          <Card
            title="Daily token volume"
            subtitle="Cache reads dominate: each turn re-reads the cached conversation. Output is shown on its own below."
            table={{
              columns: ["Day", "Cache reads", "Cache writes", "Fresh input", "Output", "Cost"],
              rows: days.map((d) => [fmtDay(d.day), fmtFull(d.usage.cr), fmtFull(d.usage.cw5 + d.usage.cw1h), fmtFull(d.usage.in), fmtFull(d.usage.out), fmtUSD(d.cost)]),
            }}
          >
            <StackedDaily data={tokenRows} series={TOKEN_SERIES} format={fmtNum} height={280} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Output tokens per day" subtitle="What Claude actually wrote, thinking included">
              <StackedDaily data={outRows} series={[{ key: "out", label: "Output", color: seriesSlot(1) }]} format={fmtNum} height={220} />
            </Card>
            <Card
              title="Session length"
              subtitle="Hands-on time per session"
              table={{ columns: ["Length", "Sessions"], rows: lengths.map((b) => [b.label, b.value]) }}
            >
              <Columns data={lengths} format={fmtNum} />
            </Card>
          </div>

          <Card title="Weekly rhythm" subtitle={`API calls by weekday and hour (${snapshot.timeZone})`}>
            <WeekHourHeatmap grid={grid} unit="API calls" />
          </Card>

          <Card title="Prompt rhythm, long view" subtitle="Prompts by weekday and hour from history.jsonl · not affected by filters">
            <WeekHourHeatmap grid={snapshot.prompts.weekHour} unit="prompts" />
          </Card>

          <Card title="Activity calendar" subtitle="Prompts per day · not affected by filters">
            <ActivityCalendar days={cal} today={dayKey(new Date(snapshot.generatedAt))} />
          </Card>

          {legacyRows.length > 0 && (
            <Card
              title="Earlier messages per day"
              subtitle={`From the stats cache, ${fmtDay(snapshot.legacy.from!)} – ${fmtDay(snapshot.legacy.to!)} · not affected by filters`}
              table={{ columns: ["Day", "Messages", "Tool calls"], rows: legacyRows.map((r) => [fmtDay(r.day), r.messages, r.toolCalls]) }}
            >
              <StackedDaily data={legacyRows} series={[{ key: "messages", label: "Messages", color: seriesSlot(0) }]} format={fmtNum} height={220} />
            </Card>
          )}
        </div>
      )}
    </>
  );
}
