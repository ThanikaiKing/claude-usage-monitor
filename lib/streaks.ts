import { type CalendarDay, dayKey, parseDay } from "./aggregate";

const DAY_MS = 86_400_000;

export interface Run {
  start: string;
  end: string;
  length: number;
  prompts: number;
}

export interface Milestone {
  id: string;
  label: string;
  detail: string;
  target: number;
  value: number;
  earned: boolean;
}

export interface WeekRow {
  /** Monday of the week. */
  start: string;
  days: { day: string; active: boolean; prompts: number; future: boolean }[];
  activeDays: number;
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const activity = (d: CalendarDay) => d.prompts || (d.messages > 0 ? 1 : 0);

export function streakStats(calendar: CalendarDay[], today: string) {
  const active = calendar.filter((d) => activity(d) > 0);
  const byDay = new Map(active.map((d) => [d.day, d]));

  // Consecutive-day runs (DST-safe: compare calendar days, not milliseconds).
  const runs: Run[] = [];
  for (const d of active) {
    const last = runs[runs.length - 1];
    if (last && dayKey(addDays(parseDay(last.end), 1)) === d.day) {
      last.end = d.day;
      last.length += 1;
      last.prompts += d.prompts;
    } else {
      runs.push({ start: d.day, end: d.day, length: 1, prompts: d.prompts });
    }
  }

  const yesterday = dayKey(addDays(parseDay(today), -1));
  const activeToday = byDay.has(today);
  const lastRun = runs[runs.length - 1];
  const current = lastRun && (lastRun.end === today || lastRun.end === yesterday) ? lastRun : null;
  const currentLength = current?.length ?? 0;
  const longest = runs.reduce((a, r) => (r.length > a.length ? r : a), runs[0] ?? { start: today, end: today, length: 0, prompts: 0 });
  // The record set by a streak other than the current one.
  const previousBest = runs.filter((r) => r !== current).reduce((a, r) => Math.max(a, r.length), 0);

  const totalPrompts = active.reduce((a, d) => a + d.prompts, 0);
  const bestDay = active.reduce<CalendarDay | null>((a, d) => (!a || d.prompts > a.prompts ? d : a), null);

  // Last 12 weeks, Monday-first.
  const todayDate = parseDay(today);
  const monday = addDays(todayDate, -((todayDate.getDay() + 6) % 7));
  const weeks: WeekRow[] = [];
  for (let w = 11; w >= 0; w--) {
    const start = addDays(monday, -7 * w);
    const days = Array.from({ length: 7 }, (_, i) => {
      const k = dayKey(addDays(start, i));
      const rec = byDay.get(k);
      return { day: k, active: Boolean(rec), prompts: rec?.prompts ?? 0, future: k > today };
    });
    weeks.push({ start: dayKey(start), days, activeDays: days.filter((d) => d.active).length });
  }

  // How often each weekday is an active day, since the first recorded day.
  const first = active[0] ? parseDay(active[0].day) : todayDate;
  const seen = Array(7).fill(0);
  const hit = Array(7).fill(0);
  for (let d = first; d <= todayDate; d = addDays(d, 1)) {
    seen[d.getDay()] += 1;
    if (byDay.has(dayKey(d))) hit[d.getDay()] += 1;
  }
  const weekdayRate = seen.map((n, i) => (n ? hit[i] / n : 0));

  const ladder = (id: string, value: number, targets: number[], label: (t: number) => string, detail: string): Milestone[] =>
    targets.map((t) => ({ id: `${id}-${t}`, label: label(t), detail, target: t, value, earned: value >= t }));

  const milestones = {
    streak: ladder("streak", longest.length, [3, 7, 14, 21, 30, 60, 100], (t) => `${t}-day streak`, "Longest run of consecutive days"),
    days: ladder("days", active.length, [10, 25, 50, 100, 200, 365], (t) => `${t} active days`, "Days with at least one prompt"),
    prompts: ladder("prompts", totalPrompts, [100, 500, 1000, 2500, 5000, 10000], (t) => `${t.toLocaleString("en-US")} prompts`, "Prompts sent, all time"),
  };

  return {
    runs,
    current,
    currentLength,
    longest,
    previousBest,
    activeToday,
    todayPrompts: byDay.get(today)?.prompts ?? 0,
    activeDays: active.length,
    totalPrompts,
    bestDay,
    weeks,
    weekdayRate,
    milestones,
    firstDay: active[0]?.day ?? null,
  };
}

export type StreakStats = ReturnType<typeof streakStats>;

/** Days between two day keys, inclusive. */
export const spanDays = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / DAY_MS) + 1;
