# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Eval Studio is an LLM benchmarking tool for evaluating frontend code generation. It runs prompts against multiple models via OpenAI-compatible APIs (primarily LM Studio), renders the HTML output in sandboxed iframes, and provides a manual scoring system with an aggregate scoreboard.

## Commands

```bash
npm run dev          # Start dev server (default :3000)
npm run build        # Production build (also validates TypeScript)
npm run lint         # ESLint
```

No test framework is configured.

## Architecture

**Stack:** Next.js 16 (App Router) + React 19 + TypeScript (strict) + Tailwind CSS 4. No database — all storage is file-based.

### Data Flow

```
config/models.json (providers[])
  → src/lib/models.ts fetches /v1/models from each provider, caches 30s
  → /api/models serves them (API keys stripped)

benchmarks/[id]/prompt.txt
  → src/lib/benchmark-runner.ts sends to model via OpenAI chat completions
  → src/lib/code-extractor.ts parses fenced code blocks from response
  → Saves HTML to public/results/[benchmark]/[model]/index.html
  → Frontend renders in sandboxed iframe

Scoring:
  → ScorePanel POSTs to /api/scores → public/results/scores.json
  → Scoreboard reads scores and computes model × benchmark matrix
```

### Key Files

- **`src/app/page.tsx`** — Main orchestrator (client component). Manages all state, coordinates sidebar/toolbar/tabs/results. This is where "RUN BENCHMARK" and "RUN ALL" logic lives.
- **`src/lib/models.ts`** — Auto-discovers models from providers via `/v1/models`. Supports `env:VAR_NAME` API key resolution. Manual overrides in `config/models.json` `models[]` take precedence over discovered ones.
- **`src/lib/benchmark-runner.ts`** — `callModel()` sends chat completion requests. System prompt forces HTML-only fenced output. Models run sequentially to avoid overwhelming local inference.
- **`src/lib/code-extractor.ts`** — Regex-based extraction with priority: html > js > css > generic fenced blocks. `mergeBlocks()` combines multiple blocks into one HTML document.
- **`src/components/ResultsGrid.tsx`** — Renders result cards with iframes + ScorePanel below each.
- **`src/components/Scoreboard.tsx`** — Read-only aggregate table. Color-coded: green ≥7, yellow ≥4, red <4.

### API Routes (all in `src/app/api/`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/benchmarks` | GET | Scan `benchmarks/` dir, return prompts |
| `/api/models` | GET | Auto-discover + manual models (keys hidden) |
| `/api/run-benchmark` | POST | `{benchmarkId, modelIds[]}` — run selected |
| `/api/run-all-benchmarks` | POST | `{modelId}` — run ALL benchmarks for 1 model |
| `/api/results` | GET | Directory listing of saved results |
| `/api/scores` | GET/POST | Read/upsert scores (keyed by benchmark+model+scorer) |

### Config

**`config/models.json`** — `providers[]` array with `{id, name, baseUrl, apiKey, type}`. Each provider's `/v1/models` is queried. Embedding/TTS/reranker models are auto-filtered. Optional `models[]` for manual overrides.

**`config/scoring.json`** — Array of `{id, name, description, min, max}` criteria. Also served from `public/config/scoring.json` for frontend fetch.

### Storage

All in `public/results/`:
- `[benchmark-id]/[model-id]/index.html` — Rendered output
- `[benchmark-id]/[model-id]/raw-response.txt` — Full LLM response
- `scores.json` — All scores (flat array, upserted by benchmark+model+scorer)

### Adding a Benchmark

Create `benchmarks/[kebab-name]/prompt.txt`. It auto-appears on next page load. Name is derived from directory (kebab → Title Case).

### Adding a Provider

Add to `config/models.json` `providers[]`. Must be OpenAI-compatible (`/v1/models` + `/v1/chat/completions`). Models appear within 30s (cache TTL).

## Conventions

- Path alias `@/` maps to `src/`
- All components are client components (`"use client"`)
- Dark theme: zinc-950 background, zinc-100 text, blue/purple/green accents
- `getModels()` and `getModelById()` are async (provider discovery)
- Benchmarks require pure HTML/CSS/JS — no CDNs or frameworks in output
