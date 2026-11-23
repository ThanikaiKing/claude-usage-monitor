# Claude Code Usage Monitor

A static Next.js dashboard for your Claude Code usage: API-equivalent cost, tokens, cache efficiency, sessions, projects, models, effort levels, subagents and tools.

Claude Code keeps its logs on your machine (`~/.claude`), which a Vercel build can't reach. So there are two steps:

1. **Ingest (local):** `npm run ingest` reads `~/.claude` and writes an aggregated snapshot to `data/usage.json`.
2. **Render (anywhere):** the Next.js app bundles that snapshot into fully static pages.

## Quick start

```bash
npm install
npm run ingest     # build data/usage.json from ~/.claude
npm run dev        # http://localhost:3000
```

### Refresh and deploy

```bash
npm run ingest
git add data/usage.json && git commit -m "Refresh usage snapshot"
git push           # Vercel rebuilds on push
```

## Keeping it up to date automatically

Claude Code deletes transcripts 30 days after a session was last used (`cleanupPeriodDays`), so the snapshot must be refreshed at least that often. Two pieces handle it:

| Piece | When | What it does |
|---|---|---|
| `scripts/hook-ingest.ps1` | Every Claude Code session end (async `SessionEnd` hook in `~/.claude/settings.json`) | Refreshes `data/usage.json` locally. No commit, no push. |
| `scripts/daily-sync.ps1` | Daily at 10:00 via the **Claude Usage Monitor Sync** scheduled task. If the laptop was off or asleep, it runs as soon as it's back on and online. | Ingests, commits `data/usage.json` only if it changed, pushes, and Vercel redeploys. |

Safety rules in the daily sync: it only runs on `main`, only ever commits `data/usage.json`, and won't push if any unpushed commit touches another file (push those yourself). Logs go to `logs/` (git-ignored).

```powershell
pwsh -File scripts/register-sync-task.ps1 -At 21:00          # change the time
Start-ScheduledTask -TaskName 'Claude Usage Monitor Sync'      # run now
Unregister-ScheduledTask -TaskName 'Claude Usage Monitor Sync' # remove
```

## What gets read

| Source | Used for |
|---|---|
| `~/.claude/projects/**/*.jsonl` (incl. `subagents/`) | Per-call token usage, models, effort, tools and errors, titles, context growth |
| `~/.claude/stats-cache.json` | Older daily aggregates that survive transcript pruning ("Earlier period") |
| `~/.claude/history.jsonl` | Prompt counts per day/hour for the activity calendar. **Prompt text is never exported.** |

Assistant records are deduplicated by `message.id`, since Claude Code writes one record per content block.

**History is cumulative.** Claude Code prunes old transcripts. Ingest merges into the existing snapshot: sessions found on disk replace their stored copy, and pruned sessions are kept. To keep more raw history, raise `cleanupPeriodDays` in `~/.claude/settings.json`.

## Options

```bash
npm run ingest -- --claude-dir /path/to/.claude   # read another location
npm run ingest -- --redact                        # alias projects ("Project A"), drop titles and branches
```

## Cost model

Costs are **API-equivalent estimates at list prices**. Subscription plans bill differently. Prices live in `lib/pricing.ts` (cache writes 1.25× input for the 5-minute TTL and 2× for 1-hour; cache reads at each model's published rate). Edit that file and rebuild to re-price everything; no re-ingest is needed.

The transcript-based estimate runs a little below Claude Code's own in-session meter (`cost-state` records). Claude Code also bills background calls, such as titles, compaction and helper models, that never reach the transcript. The Overview shows both figures.

## Privacy

`data/usage.json` holds aggregates only: no prompts, no responses, and no file paths. It does contain project names and AI-generated session titles. If the repo or deployment is public, ingest with `--redact`, or enable Vercel Deployment Protection.

## Stack

Next.js 16 (App Router, fully static), React 19, Tailwind CSS 4, Recharts 3, TypeScript.
