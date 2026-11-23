const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-US");

export const fmtNum = (n: number) => (Math.abs(n) < 10_000 ? whole.format(Math.round(n)) : compact.format(n));
export const fmtFull = (n: number) => whole.format(Math.round(n));

export function fmtUSD(n: number, opts: { precise?: boolean } = {}) {
  if (n === 0) return "$0";
  if (Math.abs(n) < 0.01) return "<$0.01";
  if (Math.abs(n) >= 10_000 && !opts.precise) return `$${compact.format(n)}`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(n) >= 100 && !opts.precise ? 0 : 2,
  }).format(n);
}

export const fmtPct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;

export function fmtDuration(ms: number) {
  const m = Math.round(ms / 60_000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const fmtDay = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return dayFmt.format(new Date(y, m - 1, d));
};
export const fmtDateTime = (ms: number) => dateTimeFmt.format(new Date(ms));

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
