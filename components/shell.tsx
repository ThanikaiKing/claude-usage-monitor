"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useData } from "./data-context";
import { type RangeKey, allModels, allProjects } from "@/lib/aggregate";
import { modelLabel } from "@/lib/pricing";

const NAV = [
  { href: "/", label: "Overview", icon: "M3 12h4l3-8 4 16 3-8h4" },
  { href: "/timeline", label: "Timeline", icon: "M4 19V9m5 10V5m5 14v-7m5 7V8" },
  { href: "/projects", label: "Projects", icon: "M3 7l2-3h5l2 3h9v12H3z" },
  { href: "/models", label: "Models", icon: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5" },
  { href: "/tools", label: "Tools", icon: "M14 6l4 4-9 9H5v-4zM16 4l4 4" },
  { href: "/sessions", label: "Sessions", icon: "M4 5h16M4 10h16M4 15h10M4 20h7" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    const attr = document.documentElement.dataset.theme as "light" | "dark" | undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the theme the boot script applied
    setTheme(attr ?? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
  }, []);
  const next = theme === "light" ? "dark" : "light";
  return (
    <button
      type="button"
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("theme", next);
        } catch {
          /* storage unavailable */
        }
        setTheme(next);
      }}
      className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      <Icon d={theme === "light" ? "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" : "M12 3v2m0 14v2M5 12H3m18 0h-2M6 6l1.5 1.5M16.5 16.5L18 18M6 18l1.5-1.5M16.5 7.5L18 6M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"} />
    </button>
  );
}

const selectCls =
  "h-9 min-w-0 rounded-lg border border-line bg-surface-1 px-2.5 text-[13px] text-ink outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent";

function hasFilters(f: { range: RangeKey; project: string | null; model: string | null }) {
  return Number(f.range !== "all") + Number(Boolean(f.project)) + Number(Boolean(f.model));
}

function FilterBar({ stacked = false }: { stacked?: boolean }) {
  const { snapshot, filters, setFilters } = useData();
  const ranges: { key: RangeKey; label: string }[] = [
    { key: "7d", label: "7D" },
    { key: "14d", label: "14D" },
    { key: "30d", label: "30D" },
    { key: "all", label: "All" },
  ];
  return (
    <div className={clsx(stacked ? "grid grid-cols-2 gap-2" : "flex flex-wrap items-center gap-2")}>
      <div
        className={clsx("rounded-lg border border-line bg-surface-1 p-0.5", stacked ? "col-span-2 grid grid-cols-4" : "flex")}
        role="group"
        aria-label="Date range"
      >
        {ranges.map((r) => (
          <button
            key={r.key}
            type="button"
            aria-pressed={filters.range === r.key}
            onClick={() => setFilters({ range: r.key })}
            className={clsx(
              "rounded-md text-[13px] transition-colors",
              stacked ? "h-9" : "h-8 px-2.5",
              filters.range === r.key ? "bg-accent-wash font-medium text-ink" : "text-muted hover:text-ink",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
      <select
        aria-label="Project"
        className={clsx(selectCls, stacked && "w-full")}
        value={filters.project ?? ""}
        onChange={(e) => setFilters({ project: e.target.value || null })}
      >
        <option value="">All projects</option>
        {allProjects(snapshot).map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <select
        aria-label="Model"
        className={clsx(selectCls, stacked && "w-full")}
        value={filters.model ?? ""}
        onChange={(e) => setFilters({ model: e.target.value || null })}
      >
        <option value="">All models</option>
        {allModels(snapshot).map((m) => (
          <option key={m} value={m}>
            {modelLabel(m)}
          </option>
        ))}
      </select>
      {hasFilters(filters) > 0 && (
        <button
          type="button"
          onClick={() => setFilters({ range: "all", project: null, model: null })}
          className={clsx("h-9 rounded-lg px-2 text-[13px] text-muted hover:text-ink", stacked && "col-span-2 border border-line")}
        >
          Reset filters
        </button>
      )}
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={clsx("flex items-center gap-2.5", !compact && "mb-8 px-2")}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-wash text-accent">
        <Icon d="M12 3v3m0 12v3M3 12h3m12 0h3M6.3 6.3l2.1 2.1m7.2 7.2l2.1 2.1m0-11.4l-2.1 2.1m-7.2 7.2l-2.1 2.1" />
      </span>
      <span className="leading-tight">
        <span className="block text-[14px] font-semibold text-ink">Usage Monitor</span>
        <span className="block text-[11px] text-muted">Claude Code</span>
      </span>
    </Link>
  );
}

/** Phone/tablet header: brand + actions, scrollable section tabs, collapsible filters. */
function MobileHeader({ isActive }: { isActive: (href: string) => boolean }) {
  const { filters } = useData();
  const [open, setOpen] = useState(false);
  const active = hasFilters(filters);
  const tabsRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  // Keep the current section's tab in view.
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-plane/85 backdrop-blur-md lg:hidden">
      <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
        <Brand compact />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-filters"
            className={clsx(
              "flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] transition-colors",
              open || active ? "border-accent/40 bg-accent-wash text-ink" : "border-line text-ink-2",
            )}
          >
            <Icon d="M4 6h16M7 12h10M10 18h4" />
            Filters
            {active > 0 && (
              <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[11px] font-semibold text-white">
                {active}
              </span>
            )}
          </button>
          <ThemeToggle />
        </div>
      </div>
      {open && (
        <div id="mobile-filters" className="border-t border-line px-4 py-3">
          <FilterBar stacked />
        </div>
      )}
      <nav
        ref={tabsRef}
        className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2 [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-24px),transparent)]"
        aria-label="Sections"
      >
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={isActive(n.href) ? "page" : undefined}
            className={clsx(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors",
              isActive(n.href) ? "bg-surface-2 text-ink" : "text-muted hover:text-ink",
            )}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { snapshot } = useData();
  const generated = new Date(snapshot.generatedAt);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="mx-auto flex min-h-screen max-w-[1440px]">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line px-3 py-5 lg:flex">
        <Brand />
        <nav className="flex flex-col gap-0.5" aria-label="Sections">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(n.href) ? "page" : undefined}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-2.5 py-2 text-[14px] transition-colors",
                isActive(n.href) ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface-1 hover:text-ink",
              )}
            >
              <Icon d={n.icon} />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-1 px-2 text-[11px] text-muted">
          <p>
            Snapshot{" "}
            {generated.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: snapshot.timeZone })}
          </p>
          <p>{snapshot.timeZone}</p>
          {snapshot.redacted && <p>Redacted build</p>}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader isActive={isActive} />
        <header className="sticky top-0 z-30 hidden border-b border-line bg-plane/80 px-6 py-3 backdrop-blur-md lg:block">
          <div className="flex items-center justify-between gap-3">
            <FilterBar />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 px-4 pt-5 pb-6 sm:px-6 lg:py-6">{children}</main>
        <footer className="px-4 pb-6 text-[11px] text-muted sm:px-6">
          Costs are API-equivalent estimates at list prices; subscription plans bill differently.
        </footer>
      </div>
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h1>
      {children && <p className="mt-1 max-w-2xl text-[14px] text-muted">{children}</p>}
    </div>
  );
}
