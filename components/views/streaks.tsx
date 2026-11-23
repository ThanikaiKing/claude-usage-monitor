"use client";

import clsx from "clsx";
import { useMemo } from "react";
import { useData } from "../data-context";
import { PageHeader } from "../shell";
import { ActivityCalendar } from "../charts";
import { BarList, Card, StatTile, Tip } from "../ui";
import { calendar, dayKey } from "@/lib/aggregate";
import { fmtDay, fmtNum, fmtPct } from "@/lib/format";
import { type Milestone, spanDays, streakStats } from "@/lib/streaks";

const WEEKLY_GOAL = 5;
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function Flame({ lit, className }: { lit: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <linearGradient id="flame" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--series-8)" />
          <stop offset="55%" stopColor="var(--series-2)" />
          <stop offset="100%" stopColor="var(--series-4)" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.5c.6 3.2 3.9 4.9 4.9 8.4.9 3.3-.6 7.6-4.9 8.6-4.6 1-8.1-2.6-7.4-6.6.4-2.4 2-3.6 2.6-5.6.6 1.6.5 2.8 1.8 3.6C9.9 7.9 10.8 5 12 2.5z"
        fill={lit ? "url(#flame)" : "var(--surface-3)"}
      />
      <path d="M12.2 12.2c.4 1.5 2 2.2 1.9 4-.1 1.4-1.1 2.4-2.3 2.4-1.5 0-2.5-1.2-2.3-2.6.2-1.4 1.6-2 2.7-3.8z" fill={lit ? "var(--series-4)" : "var(--surface-2)"} opacity={0.9} />
    </svg>
  );
}

function Badge({ m, next }: { m: Milestone; next: boolean }) {
  const pct = Math.min(1, m.value / m.target);
  return (
    <Tip
      className="outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-xl"
      content={
        <>
          <b>{m.label}</b>
          <br />
          {m.detail}: {fmtNum(m.value)}
          {!m.earned && (
            <>
              <br />
              {fmtNum(m.target - m.value)} to go
            </>
          )}
        </>
      }
    >
      <div
        className={clsx(
          "flex h-full flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors",
          m.earned ? "border-accent/40 bg-accent-wash" : next ? "border-line bg-surface-2" : "border-line opacity-55",
        )}
      >
        <span
          className={clsx(
            "grid h-10 w-10 place-items-center rounded-full",
            m.earned ? "bg-accent text-white shadow-[0_0_24px_var(--accent-wash)]" : "bg-surface-3 text-muted",
          )}
        >
          {m.earned ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          )}
        </span>
        <span className={clsx("text-[12px] leading-tight font-medium", m.earned ? "text-ink" : "text-ink-2")}>{m.label}</span>
        {!m.earned && (
          <span className="mt-auto w-full">
            <span className="block h-1.5 w-full rounded-full bg-surface-3">
              <span className="block h-1.5 rounded-full bg-accent" style={{ width: `${pct * 100}%` }} />
            </span>
            <span className="tabular mt-1 block text-[11px] text-muted">
              {fmtNum(m.value)}/{fmtNum(m.target)}
            </span>
          </span>
        )}
      </div>
    </Tip>
  );
}

export function StreaksView() {
  const { snapshot } = useData();
  const today = dayKey(new Date(snapshot.generatedAt));
  const cal = useMemo(() => calendar(snapshot), [snapshot]);
  const st = useMemo(() => streakStats(cal, today), [cal, today]);

  const cur = st.currentLength;
  const best = st.previousBest;
  const isRecord = cur > 0 && cur > best;
  const tied = cur > 0 && cur === best;
  const target = Math.max(best + 1, cur + 1);

  let headline: string;
  let message: string;
  if (cur === 0) {
    headline = "Fresh start";
    message = `No active streak. Send a prompt today and you're on day one. Your record is ${best} days.`;
  } else if (!st.activeToday) {
    headline = "Streak at risk";
    message = `Nothing logged today yet. One prompt keeps it alive and makes it ${cur + 1} days${cur + 1 > best ? ", a new record" : ""}.`;
  } else if (isRecord) {
    headline = "New personal record";
    message = `${cur} days and counting, ${cur - best} past your previous best of ${best}. Every day from here extends the record.`;
  } else if (tied) {
    headline = "Record tied";
    message = `You've matched your best ever run of ${best} days. Show up tomorrow and it's a new record.`;
  } else {
    headline = "On a roll";
    message = `${best - cur + 1} more day${best - cur + 1 === 1 ? "" : "s"} to beat your record of ${best}.`;
  }

  const allBadges = [...st.milestones.streak, ...st.milestones.days, ...st.milestones.prompts];
  const earned = allBadges.filter((m) => m.earned).length;
  const weeksHit = st.weeks.filter((w) => w.activeDays >= WEEKLY_GOAL).length;
  const thisWeek = st.weeks[st.weeks.length - 1];
  const daysLeftThisWeek = thisWeek.days.filter((d) => d.future).length;
  const topRuns = [...st.runs].sort((a, b) => b.length - a.length || b.end.localeCompare(a.end)).slice(0, 8);
  const strongest = MON_FIRST.reduce((a, d) => (st.weekdayRate[d] > st.weekdayRate[a] ? d : a), 1);

  return (
    <>
      <PageHeader title="Streaks">
        Consecutive days with at least one prompt, as of the {fmtDay(today)} snapshot. Not affected by filters.
      </PageHeader>

      <div className="space-y-4">
        {/* Hero */}
        <section className="rise relative overflow-hidden rounded-2xl border border-line bg-surface-1 p-5 sm:p-7">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -left-16 h-72 w-72 rounded-full opacity-50 blur-3xl"
            style={{ background: cur > 0 ? "radial-gradient(circle, var(--series-2), transparent 65%)" : "var(--accent-wash)" }}
          />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <Flame lit={cur > 0} className={clsx("h-20 w-20 shrink-0 sm:h-24 sm:w-24", cur > 0 && "drop-shadow-[0_0_18px_rgba(217,89,38,0.45)]")} />
              <div>
                <p className="text-[13px] text-muted">Current streak</p>
                <p className="text-6xl font-semibold tracking-tight text-ink sm:text-7xl">
                  {cur}
                  <span className="ml-2 text-xl font-medium text-ink-2 sm:text-2xl">day{cur === 1 ? "" : "s"}</span>
                </p>
              </div>
            </div>
            <div className="min-w-0 flex-1 sm:border-l sm:border-line sm:pl-6">
              <p className="flex items-center gap-2 text-lg font-semibold text-ink">
                {headline}
                {(isRecord || tied) && (
                  <span className="rounded-full bg-accent-wash px-2 py-0.5 text-[11px] font-semibold tracking-wide text-accent uppercase">
                    {isRecord ? "Record" : "Tied"}
                  </span>
                )}
              </p>
              <p className="mt-1 text-[14px] text-ink-2">{message}</p>
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-[12px] text-muted">
                  <span>Progress to {isRecord ? "your next day" : "a new record"}</span>
                  <span className="tabular">
                    {cur} / {target} days
                  </span>
                </div>
                <div className="relative h-2.5 w-full rounded-full bg-surface-3">
                  <div
                    className="h-2.5 rounded-full transition-[width] duration-700"
                    style={{ width: `${Math.min(100, (cur / target) * 100)}%`, background: "linear-gradient(90deg, var(--series-2), var(--series-4))" }}
                  />
                  {best > 0 && (
                    <span
                      className="absolute -top-1 h-[18px] w-0.5 rounded bg-ink-2"
                      style={{ left: `${(best / target) * 100}%` }}
                      title={`Previous best: ${best} days`}
                    />
                  )}
                </div>
                {best > 0 && <p className="mt-1.5 text-[11px] text-muted">Marker shows your previous best ({best} days).</p>}
              </div>
              {st.current && (
                <p className="mt-3 text-[12px] text-muted">
                  Running since {fmtDay(st.current.start)} · {fmtNum(st.current.prompts)} prompts in this streak
                  {st.activeToday ? ` · ${fmtNum(st.todayPrompts)} today` : ""}
                </p>
              )}
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile label="Longest streak" value={`${st.longest.length} days`} sub={st.longest.length ? `${fmtDay(st.longest.start)} – ${fmtDay(st.longest.end)}` : "—"} />
          <StatTile label="Active days" value={fmtNum(st.activeDays)} sub={st.firstDay ? `since ${fmtDay(st.firstDay)} · ${fmtPct(st.activeDays / spanDays(st.firstDay, today))} of days` : undefined} />
          <StatTile label="Best day" value={st.bestDay ? fmtNum(st.bestDay.prompts) : "—"} sub={st.bestDay ? `prompts on ${fmtDay(st.bestDay.day)}` : undefined} />
          <StatTile label="Badges earned" value={`${earned} / ${allBadges.length}`} sub={`${fmtNum(st.totalPrompts)} prompts all time`} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
          <Card
            title="Weekly goal"
            subtitle={`Show up ${WEEKLY_GOAL} of 7 days · hit in ${weeksHit} of the last 12 weeks`}
          >
            <div>
              <div className="grid grid-cols-12 gap-0.5 sm:gap-1.5">
                {st.weeks.map((w, wi) => {
                  const hitGoal = w.activeDays >= WEEKLY_GOAL;
                  const isThisWeek = wi === st.weeks.length - 1;
                  return (
                    <div key={w.start} className={clsx("flex flex-col items-center gap-1 rounded-lg py-1.5", isThisWeek && "bg-surface-2")}>
                      {w.days.map((d) => (
                        <Tip
                          key={d.day}
                          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          content={
                            <>
                              <b>{fmtDay(d.day)}</b>
                              <br />
                              {d.future ? "Still to come" : d.active ? `${fmtNum(d.prompts)} prompts` : "Rest day"}
                            </>
                          }
                        >
                          <span
                            className={clsx(
                              "block h-3.5 w-3.5 rounded-full",
                              d.future ? "border border-dashed border-line" : d.active ? "" : "bg-surface-3",
                            )}
                            style={d.active ? { background: hitGoal ? "var(--accent)" : "var(--seq-2)" } : undefined}
                          />
                        </Tip>
                      ))}
                      <span className={clsx("tabular mt-1 text-[11px]", hitGoal ? "font-semibold text-ink" : "text-muted")}>
                        {w.activeDays}/7
                      </span>
                      <span className="text-[10px] whitespace-nowrap text-muted">
                        {isThisWeek
                          ? "now"
                          : wi === 0 || Number(w.start.slice(8)) <= 7
                            ? fmtDay(w.start).split(" ")[1]
                            : fmtDay(w.start).split(" ")[0]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="mt-3 text-[12px] text-muted">
              {thisWeek.activeDays >= WEEKLY_GOAL
                ? `Goal met this week with ${thisWeek.activeDays} active days.`
                : `This week: ${thisWeek.activeDays} of ${WEEKLY_GOAL} days${
                    thisWeek.activeDays + daysLeftThisWeek >= WEEKLY_GOAL
                      ? `, still reachable with ${WEEKLY_GOAL - thisWeek.activeDays} more`
                      : ", out of reach this week, so aim for next"
                  }.`}{" "}
              Brighter dots are weeks that hit the goal.
            </p>
          </Card>

          <Card title="Hall of streaks" subtitle={`Your ${topRuns.length} longest runs of ${st.runs.length}`}>
            <BarList
              format={(n) => `${n} day${n === 1 ? "" : "s"}`}
              rows={topRuns.map((r) => {
                const isCurrent = st.current === r;
                return {
                  key: r.start,
                  label: (
                    <span className="flex items-center gap-2">
                      {r.start === r.end ? fmtDay(r.start) : `${fmtDay(r.start)} – ${fmtDay(r.end)}`}
                      {isCurrent && (
                        <span className="rounded-full bg-accent-wash px-1.5 py-px text-[10px] font-semibold text-accent uppercase">Live</span>
                      )}
                    </span>
                  ),
                  value: r.length,
                  color: isCurrent ? "var(--series-2)" : "var(--series-1)",
                  tip: `${fmtNum(r.prompts)} prompts across ${r.length} days`,
                };
              })}
            />
          </Card>
        </div>

        <Card title="Milestones" subtitle={`${earned} of ${allBadges.length} earned · hover a badge for progress`}>
          <div className="space-y-5">
            {(
              [
                ["Streaks", st.milestones.streak],
                ["Active days", st.milestones.days],
                ["Prompts", st.milestones.prompts],
              ] as const
            ).map(([label, list]) => {
              const nextId = list.find((m) => !m.earned)?.id;
              return (
                <div key={label}>
                  <p className="mb-2 text-[13px] font-medium text-ink-2">{label}</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                    {list.map((m) => (
                      <Badge key={m.id} m={m} next={m.id === nextId} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
          <Card title="Your strongest days" subtitle={`Share of each weekday you showed up · best: ${WEEKDAY_NAMES[strongest]}`}>
            <BarList
              format={(n) => fmtPct(n)}
              rows={MON_FIRST.map((d) => ({
                key: String(d),
                label: WEEKDAY_NAMES[d],
                value: st.weekdayRate[d],
                color: d === strongest ? "var(--series-2)" : "var(--series-1)",
              }))}
            />
          </Card>
          <Card title="Every day you showed up" subtitle="Prompts per day">
            <ActivityCalendar days={cal} today={today} />
          </Card>
        </div>
      </div>
    </>
  );
}
