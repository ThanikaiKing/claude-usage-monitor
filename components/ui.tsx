"use client";

import clsx from "clsx";
import { useId, useRef, useState } from "react";

export function Card({
  title,
  subtitle,
  children,
  table,
  className,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  table?: { columns: string[]; rows: (string | number)[][] };
  className?: string;
  action?: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={clsx("rise min-w-0 rounded-2xl border border-line bg-surface-1 p-4 sm:p-5", className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {table && (
            <div className="flex rounded-lg border border-line p-0.5 text-xs" role="group" aria-label="View">
              {(["Chart", "Table"] as const).map((label) => {
                const active = (label === "Table") === showTable;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setShowTable(label === "Table")}
                    aria-pressed={active}
                    className={clsx(
                      "rounded-md px-2 py-1 transition-colors",
                      active ? "bg-surface-3 text-ink" : "text-muted hover:text-ink",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </header>
      {showTable && table ? <DataTable columns={table.columns} rows={table.rows} /> : children}
    </section>
  );
}

export function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="max-h-96 overflow-auto rounded-lg border border-line">
      <table className="w-full text-left text-[13px]">
        <thead className="sticky top-0 bg-surface-2 text-muted">
          <tr>
            {columns.map((c, i) => (
              <th key={c} className={clsx("px-3 py-2 font-medium", i > 0 && "text-right")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular">
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {r.map((cell, j) => (
                <td key={j} className={clsx("px-3 py-1.5", j > 0 ? "text-right text-ink-2" : "text-ink")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  children,
  hero,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  children?: React.ReactNode;
  hero?: boolean;
}) {
  return (
    <div
      className={clsx(
        "rise flex min-w-0 flex-col justify-between rounded-2xl border border-line bg-surface-1 p-4",
        hero && "relative overflow-hidden",
      )}
    >
      {hero && (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full opacity-60 blur-3xl"
          style={{ background: "var(--accent-wash)" }}
        />
      )}
      <div className="relative">
        <p className="text-[13px] text-muted">{label}</p>
        <p className={clsx("mt-1 font-semibold tracking-tight text-ink", hero ? "text-5xl sm:text-[56px]" : "text-2xl")}>{value}</p>
        {sub && <p className="mt-1 text-[12px] text-muted">{sub}</p>}
      </div>
      {children && <div className="relative mt-3">{children}</div>}
    </div>
  );
}

/** Hover/focus tooltip for HTML marks. */
export function Tip({ content, children, className }: { content: React.ReactNode; children: React.ReactNode; className?: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const show = (x: number, y: number) => setPos({ x, y });
  return (
    <div
      ref={ref}
      className={className}
      tabIndex={0}
      aria-describedby={pos ? id : undefined}
      onMouseMove={(e) => show(e.clientX, e.clientY)}
      onMouseLeave={() => setPos(null)}
      onFocus={() => {
        const r = ref.current?.getBoundingClientRect();
        if (r) show(r.left + r.width / 2, r.top);
      }}
      onBlur={() => setPos(null)}
    >
      {children}
      {pos && (
        <div
          id={id}
          role="tooltip"
          className="pointer-events-none fixed z-50 max-w-xs rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12px] text-ink shadow-xl"
          style={{
            left: Math.min(pos.x + 14, (typeof window !== "undefined" ? window.innerWidth : 9999) - 240),
            top: pos.y + 14,
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
}

export function Swatch({ color, shape = "dot" }: { color: string; shape?: "dot" | "line" }) {
  return (
    <span
      aria-hidden
      className={clsx("inline-block shrink-0", shape === "dot" ? "h-2.5 w-2.5 rounded-full" : "h-0.5 w-3.5 rounded")}
      style={{ background: color }}
    />
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <Swatch color={i.color} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** One whole split into parts (tall segmented bar). */
export function SegmentedBar({
  parts,
  format,
}: {
  parts: { label: string; value: number; color: string }[];
  format: (n: number) => string;
}) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div>
      <div className="flex h-7 w-full gap-0.5" role="img" aria-label={shown.map((p) => `${p.label} ${format(p.value)}`).join(", ")}>
        {shown.map((p) => {
          const share = p.value / total;
          return (
            <div key={p.label} style={{ flexGrow: share, flexBasis: 0 }} className="min-w-[3px]">
              <Tip
                className="h-full rounded outline-none focus-visible:ring-2 focus-visible:ring-accent"
                content={
                  <>
                    <b>{p.label}</b>
                    <br />
                    {format(p.value)} · {(share * 100).toFixed(1)}%
                  </>
                }
              >
                <div
                  className="flex h-full items-center rounded px-2 text-[11px] font-medium whitespace-nowrap text-white"
                  style={{ background: p.color }}
                >
                  {share > 0.12 ? `${Math.round(share * 100)}%` : ""}
                </div>
              </Tip>
            </div>
          );
        })}
      </div>
      <div className="mt-3">
        <Legend items={shown.map((p) => ({ label: p.label, color: p.color }))} />
      </div>
    </div>
  );
}

/** Horizontal bar list rendered in HTML for crisp labels. */
export function BarList({
  rows,
  format,
  color = "var(--series-1)",
}: {
  rows: { key: string; label: React.ReactNode; value: number; tip?: React.ReactNode; color?: string; aside?: React.ReactNode }[];
  format: (n: number) => string;
  color?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key}>
          <Tip content={r.tip ?? format(r.value)} className="group rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate text-ink">{r.label}</span>
              <span className="tabular shrink-0 text-ink-2">
                {r.aside}
                {format(r.value)}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-2">
              <div
                className="h-2 rounded-full transition-[width] duration-500 group-hover:brightness-110"
                style={{ width: `${Math.max((r.value / max) * 100, r.value > 0 ? 1 : 0)}%`, background: r.color ?? color }}
              />
            </div>
          </Tip>
        </li>
      ))}
    </ul>
  );
}

export function Sparkline({ values, height = 36 }: { values: number[]; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values) || 1;
  const w = 100;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, height - 3 - (v / max) * (height - 6)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <div className="relative h-9 w-full" aria-hidden>
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <path d={`${d} L${w},${height} L0,${height} Z`} fill="var(--accent)" opacity={0.1} />
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      {/* End marker in HTML so the stretched SVG doesn't squash it into an oval. */}
      <span
        className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface-1"
        style={{ left: "100%", top: `${(last[1] / height) * 100}%`, background: "var(--accent)" }}
      />
    </div>
  );
}

export function Empty({ children = "No activity in this range." }: { children?: React.ReactNode }) {
  return <p className="py-10 text-center text-sm text-muted">{children}</p>;
}
