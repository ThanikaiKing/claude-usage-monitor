"use client";

import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useData } from "../data-context";
import { PageHeader } from "../shell";
import { Card, Empty, Swatch } from "../ui";
import { modelColor } from "@/lib/aggregate";
import { fmtDateTime, fmtDuration, fmtNum, fmtUSD } from "@/lib/format";
import { modelLabel } from "@/lib/pricing";
import { totalTokens } from "@/lib/types";

type SortKey = "start" | "cost" | "tokens" | "active" | "prompts" | "tools";

export function SessionsView() {
  const { snapshot, views } = useData();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "start", dir: -1 });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = views
      .filter((v) => !needle || `${v.session.title ?? ""} ${v.session.project} ${v.session.id}`.toLowerCase().includes(needle))
      .map((v) => ({
        v,
        tokens: totalTokens(v.usage),
        tools: Object.values(v.session.tools).reduce((a, t) => a + t.calls, 0),
        topModel: [...v.byModel.entries()].sort((a, b) => totalTokens(b[1]) - totalTokens(a[1]))[0]?.[0],
      }));
    const val = (r: (typeof list)[number]) =>
      ({ start: r.v.session.start, cost: r.v.cost, tokens: r.tokens, active: r.v.session.activeMs, prompts: r.v.session.prompts, tools: r.tools })[sort.key];
    return list.sort((a, b) => (val(a) - val(b)) * sort.dir);
  }, [views, q, sort]);

  const head = (key: SortKey, label: string) => (
    <th className="px-3 py-2 text-right font-medium">
      <button
        type="button"
        className={clsx("inline-flex items-center gap-1 hover:text-ink", sort.key === key && "text-ink")}
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : -1 }))}
        aria-label={`Sort by ${label}`}
      >
        {label}
        <span aria-hidden className="text-[10px]">
          {sort.key === key ? (sort.dir === 1 ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );

  return (
    <>
      <PageHeader title="Sessions">Every recorded session. Open one for its turn-by-turn context curve.</PageHeader>
      <Card
        title={`${rows.length} sessions`}
        action={
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title or project"
            aria-label="Search sessions"
            className="h-8 w-56 max-w-full rounded-lg border border-line bg-surface-2 px-3 text-[13px] text-ink outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent"
          />
        }
      >
        {rows.length === 0 ? (
          <Empty>No sessions match.</Empty>
        ) : (
          <>
          {/* Phones: sort picker + cards instead of a sideways-scrolling table. */}
          <div className="md:hidden">
            <label className="mb-3 flex items-center gap-2 text-[13px] text-muted">
              Sort by
              <select
                value={`${sort.key}:${sort.dir}`}
                onChange={(e) => {
                  const [key, dir] = e.target.value.split(":");
                  setSort({ key: key as SortKey, dir: Number(dir) as 1 | -1 });
                }}
                className="h-9 flex-1 rounded-lg border border-line bg-surface-2 px-2.5 text-[13px] text-ink"
              >
                <option value="start:-1">Newest first</option>
                <option value="start:1">Oldest first</option>
                <option value="cost:-1">Highest cost</option>
                <option value="tokens:-1">Most tokens</option>
                <option value="active:-1">Longest hands-on</option>
                <option value="prompts:-1">Most prompts</option>
                <option value="tools:-1">Most tool calls</option>
              </select>
            </label>
            <ul className="divide-y divide-line">
              {rows.map(({ v, tokens, tools, topModel }) => (
                <li key={v.session.id}>
                  <Link href={`/sessions/${v.session.id}`} className="block py-3 active:bg-surface-2">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 text-[14px] leading-snug text-ink">
                        {v.session.title ?? <span className="text-muted">Untitled · {v.session.id.slice(0, 8)}</span>}
                      </span>
                      <span className="tabular shrink-0 text-[14px] font-medium text-ink">{fmtUSD(v.cost)}</span>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
                      {topModel && <Swatch color={modelColor(snapshot, topModel)} />}
                      <span className="truncate">
                        {v.session.project} · {fmtDateTime(v.session.start)}
                      </span>
                    </p>
                    <p className="tabular mt-1 text-[12px] text-ink-2">
                      {fmtDuration(v.session.activeMs)} · {v.session.prompts} prompt{v.session.prompts === 1 ? "" : "s"} · {tools} tool
                      {tools === 1 ? "" : "s"} · {fmtNum(tokens)} tokens
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead className="text-muted">
                <tr className="border-b border-line">
                  <th className="px-3 py-2 text-left font-medium">Session</th>
                  {head("start", "Started")}
                  {head("active", "Hands-on")}
                  {head("prompts", "Prompts")}
                  {head("tools", "Tools")}
                  {head("tokens", "Tokens")}
                  {head("cost", "Cost")}
                </tr>
              </thead>
              <tbody className="tabular">
                {rows.map(({ v, tokens, tools, topModel }) => (
                  <tr key={v.session.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                    <td className="max-w-[360px] px-3 py-2">
                      <Link href={`/sessions/${v.session.id}`} className="block truncate text-ink hover:text-accent">
                        {v.session.title ?? <span className="text-muted">Untitled · {v.session.id.slice(0, 8)}</span>}
                      </Link>
                      <span className="flex items-center gap-1.5 text-[11px] text-muted">
                        {topModel && <Swatch color={modelColor(snapshot, topModel)} />}
                        {topModel ? modelLabel(topModel) : ""} · {v.session.project}
                        {v.session.entrypoint !== "cli" ? ` · ${v.session.entrypoint}` : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-ink-2">{fmtDateTime(v.session.start)}</td>
                    <td className="px-3 py-2 text-right text-ink-2">{fmtDuration(v.session.activeMs)}</td>
                    <td className="px-3 py-2 text-right text-ink-2">{v.session.prompts}</td>
                    <td className="px-3 py-2 text-right text-ink-2">{tools}</td>
                    <td className="px-3 py-2 text-right text-ink-2">{fmtNum(tokens)}</td>
                    <td className="px-3 py-2 text-right text-ink">{fmtUSD(v.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>
    </>
  );
}
