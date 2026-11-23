"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Legend, Swatch, Tip } from "./ui";
import { fmtDay, fmtNum, WEEKDAYS } from "@/lib/format";
import { type CalendarDay, dayKey, parseDay } from "@/lib/aggregate";

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
}

interface TipPayload {
  dataKey?: string | number;
  value?: number;
  color?: string;
  payload?: Record<string, unknown>;
}

function ChartTooltip({
  active,
  payload,
  label,
  series,
  format,
  labelFormat,
}: {
  active?: boolean;
  payload?: TipPayload[];
  label?: string | number;
  series: SeriesDef[];
  format: (n: number) => string;
  labelFormat?: (l: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  const rows = series
    .map((s) => ({ ...s, value: Number(payload.find((p) => p.dataKey === s.key)?.value ?? 0) }))
    .filter((r) => r.value > 0)
    .reverse();
  const total = rows.reduce((a, r) => a + r.value, 0);
  return (
    <div className="min-w-44 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12px] shadow-xl">
      <p className="mb-1.5 font-medium text-ink">{labelFormat ? labelFormat(label ?? "") : label}</p>
      {rows.length === 0 && <p className="text-muted">No activity</p>}
      {rows.map((r) => (
        <p key={r.key} className="flex items-center justify-between gap-4 py-0.5 text-ink-2">
          <span className="flex items-center gap-1.5">
            <Swatch color={r.color} />
            {r.label}
          </span>
          <span className="tabular text-ink">{format(r.value)}</span>
        </p>
      ))}
      {rows.length > 1 && (
        <p className="mt-1 flex justify-between border-t border-line pt-1 text-ink">
          <span>Total</span>
          <span className="tabular">{format(total)}</span>
        </p>
      )}
    </div>
  );
}

/** Stacked daily columns; one series per entity, fixed colours. */
export function StackedDaily({
  data,
  series,
  format,
  height = 260,
}: {
  data: Record<string, number | string>[];
  series: SeriesDef[];
  format: (n: number) => string;
  height?: number;
}) {
  const barSize = Math.max(4, Math.min(24, Math.floor(640 / Math.max(data.length, 1)) - 4));
  return (
    <div>
      {series.length > 1 && (
        <div className="mb-3">
          <Legend items={series} />
        </div>
      )}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} strokeWidth={1} />
            <XAxis dataKey="day" tickFormatter={(d) => fmtDay(String(d))} tickLine={false} axisLine minTickGap={24} />
            <YAxis tickFormatter={(v) => format(Number(v))} tickLine={false} axisLine={false} width={56} />
            <Tooltip
              cursor={{ fill: "var(--accent-wash)" }}
              content={(p) => (
                <ChartTooltip {...(p as object)} series={series} format={format} labelFormat={(l) => fmtDay(String(l))} />
              )}
            />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="a"
                fill={s.color}
                maxBarSize={barSize}
                stroke="var(--surface-1)"
                strokeWidth={i === 0 ? 0 : 1}
                radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
                isAnimationActive
                animationDuration={600}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Context size per turn with output tokens as a recessive area. */
export function ContextCurve({ data }: { data: { i: number; t: number; ctx: number; out: number; model: string }[] }) {
  const series: SeriesDef[] = [
    { key: "ctx", label: "Context (input + cache)", color: "var(--series-1)" },
    { key: "out", label: "Output", color: "var(--series-2)" },
  ];
  return (
    <div>
      <div className="mb-3">
        <Legend items={series} />
      </div>
      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="i" tickLine={false} minTickGap={24} tickFormatter={(v) => `#${v}`} />
            <YAxis tickFormatter={(v) => fmtNum(Number(v))} tickLine={false} axisLine={false} width={52} />
            <Tooltip
              cursor={{ stroke: "var(--axis)" }}
              content={(p) => (
                <ChartTooltip
                  {...(p as object)}
                  series={series}
                  format={fmtNum}
                  labelFormat={(l) => {
                    const row = data.find((d) => d.i === Number(l));
                    return row ? `Turn ${l} · ${new Date(row.t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : `Turn ${l}`;
                  }}
                />
              )}
            />
            <Area type="monotone" dataKey="out" stroke="var(--series-2)" strokeWidth={2} fill="var(--series-2)" fillOpacity={0.1} dot={false} />
            <Line type="monotone" dataKey="ctx" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--surface-1)", strokeWidth: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Simple single-series column chart (e.g. a distribution). */
export function Columns({ data, format, xLabel }: { data: { label: string; value: number }[]; format: (n: number) => string; xLabel?: string }) {
  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: xLabel ? 12 : 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} interval={0} />
          <YAxis tickFormatter={(v) => format(Number(v))} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "var(--accent-wash)" }}
            content={(p) => <ChartTooltip {...(p as object)} series={[{ key: "value", label: "Sessions", color: "var(--series-1)" }]} format={format} />}
          />
          <Bar dataKey="value" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const seqStep = (v: number, max: number) => {
  if (v <= 0 || max <= 0) return "var(--seq-0)";
  const step = Math.min(5, Math.max(1, Math.ceil((v / max) * 5)));
  return `var(--seq-${step})`;
};

function SeqScale({ unit }: { unit: string }) {
  return (
    <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted">
      <span>Less</span>
      {[0, 1, 2, 3, 4, 5].map((s) => (
        <span key={s} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: `var(--seq-${s})` }} />
      ))}
      <span>More {unit}</span>
    </div>
  );
}

/** Weekday x hour heatmap. */
export function WeekHourHeatmap({ grid, unit }: { grid: number[][]; unit: string }) {
  const max = Math.max(...grid.flat());
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="grid grid-cols-[36px_repeat(24,minmax(0,1fr))] gap-[3px]">
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-center text-[10px] text-muted tabular">
              {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
            </span>
          ))}
          {order.map((d) => (
            <div key={d} className="contents">
              <span className="pr-1 text-right text-[11px] leading-[22px] text-muted">{WEEKDAYS[d]}</span>
              {grid[d].map((v, h) => (
                <Tip
                  key={h}
                  className="h-[22px] rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  content={
                    <>
                      <b>
                        {WEEKDAYS[d]} {String(h).padStart(2, "0")}:00
                      </b>
                      <br />
                      {fmtNum(v)} {unit}
                    </>
                  }
                >
                  <div className="h-full w-full rounded-[4px]" style={{ background: seqStep(v, max) }} />
                </Tip>
              ))}
            </div>
          ))}
        </div>
        <SeqScale unit={unit} />
      </div>
    </div>
  );
}

/** GitHub-style calendar from the first recorded day to today. */
export function ActivityCalendar({ days, today }: { days: CalendarDay[]; today: string }) {
  if (!days.length) return null;
  const byDay = new Map(days.map((d) => [d.day, d]));
  const value = (d?: CalendarDay) => (d ? d.prompts || Math.round(d.messages / 8) : 0);
  const max = Math.max(...days.map((d) => value(d)));
  const start = parseDay(days[0].day);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // back to Monday
  const end = parseDay(today);
  const weeks: Date[][] = [];
  for (let d = new Date(start); d <= end; ) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    weeks.push(week);
  }
  const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short" });
  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-flex gap-[3px]">
        <div className="mr-1 flex flex-col gap-[3px] pt-5 text-[10px] text-muted">
          {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((l, i) => (
            <span key={i} className="h-3 leading-3">
              {l}
            </span>
          ))}
        </div>
        {weeks.map((w, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            <span className="h-[17px] text-[10px] whitespace-nowrap text-muted">
              {w[0].getDate() <= 7 || wi === 0 ? monthFmt.format(w[0]) : ""}
            </span>
            {w.map((d) => {
              const k = dayKey(d);
              const rec = byDay.get(k);
              const future = d > end;
              return (
                <Tip
                  key={k}
                  className="h-3 w-3 rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  content={
                    <>
                      <b>{fmtDay(k)}</b>
                      <br />
                      {rec?.prompts ? `${fmtNum(rec.prompts)} prompts` : "No prompts"}
                      {rec?.messages ? (
                        <>
                          <br />
                          {fmtNum(rec.messages)} messages
                        </>
                      ) : null}
                    </>
                  }
                >
                  <div
                    className="h-3 w-3 rounded-[3px]"
                    style={{ background: future ? "transparent" : seqStep(value(rec), max) }}
                  />
                </Tip>
              );
            })}
          </div>
        ))}
      </div>
      <SeqScale unit="activity" />
    </div>
  );
}
