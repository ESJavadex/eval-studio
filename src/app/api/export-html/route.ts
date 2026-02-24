import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

export async function GET(req: NextRequest) {
  const benchmarkId = req.nextUrl.searchParams.get("benchmarkId");
  if (!benchmarkId) {
    return NextResponse.json({ error: "benchmarkId required" }, { status: 400 });
  }

  const resultsDir = join(process.cwd(), "public", "results");
  const benchmarkDir = join(resultsDir, benchmarkId);

  if (!existsSync(benchmarkDir)) {
    return NextResponse.json({ error: "Benchmark not found" }, { status: 404 });
  }

  // Read scores
  const scoresPath = join(resultsDir, "scores.json");
  let scores: Array<{
    benchmarkId: string;
    modelId: string;
    scores: Record<string, number>;
    notes: string;
  }> = [];
  if (existsSync(scoresPath)) {
    try {
      scores = JSON.parse(readFileSync(scoresPath, "utf-8"));
    } catch {
      // ignore
    }
  }

  // Read scoring criteria
  const criteriaPath = join(process.cwd(), "config", "scoring.json");
  let criteria: Array<{ id: string; name: string }> = [];
  if (existsSync(criteriaPath)) {
    try {
      criteria = JSON.parse(readFileSync(criteriaPath, "utf-8"));
    } catch {
      // ignore
    }
  }

  // Collect all model results
  const modelDirs = readdirSync(benchmarkDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => existsSync(join(benchmarkDir, d.name, "index.html")));

  const cards: Array<{
    modelId: string;
    html: string;
    scores: Record<string, number> | null;
    notes: string;
  }> = [];

  for (const dir of modelDirs) {
    const htmlPath = join(benchmarkDir, dir.name, "index.html");
    const html = readFileSync(htmlPath, "utf-8");
    const modelScore = scores.find(
      (s) => s.benchmarkId === benchmarkId && s.modelId === dir.name
    );
    cards.push({
      modelId: dir.name,
      html,
      scores: modelScore?.scores ?? null,
      notes: modelScore?.notes ?? "",
    });
  }

  // Sort: scored first (by avg descending), then unscored alphabetically
  cards.sort((a, b) => {
    const aAvg = a.scores
      ? Object.values(a.scores).reduce((s, v) => s + v, 0) / Object.values(a.scores).length
      : -1;
    const bAvg = b.scores
      ? Object.values(b.scores).reduce((s, v) => s + v, 0) / Object.values(b.scores).length
      : -1;
    if (aAvg !== bAvg) return bAvg - aAvg;
    return a.modelId.localeCompare(b.modelId);
  });

  // Pretty benchmark name
  const benchmarkName = benchmarkId
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const exportHtml = buildShowcaseHtml(benchmarkName, benchmarkId, cards, criteria);

  const download = req.nextUrl.searchParams.get("download") === "1";
  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
  };
  if (download) {
    headers["Content-Disposition"] = `attachment; filename="${benchmarkId}-showcase.html"`;
  }

  return new NextResponse(exportHtml, { headers });
}

function escapeForSrcdoc(html: string): string {
  // Escape for use inside srcdoc attribute
  return html
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function scoreColor(val: number): string {
  if (val >= 7) return "#4ade80";
  if (val >= 4) return "#facc15";
  return "#f87171";
}

function buildShowcaseHtml(
  benchmarkName: string,
  benchmarkId: string,
  cards: Array<{
    modelId: string;
    html: string;
    scores: Record<string, number> | null;
    notes: string;
  }>,
  criteria: Array<{ id: string; name: string }>
): string {
  const cardCount = cards.length;
  const cols = cardCount <= 2 ? cardCount : cardCount <= 4 ? 2 : 3;

  const cardsHtml = cards
    .map((card) => {
      const avg = card.scores
        ? (
            Object.values(card.scores).reduce((s, v) => s + v, 0) /
            Object.values(card.scores).length
          ).toFixed(1)
        : null;

      const scoresHtml = card.scores
        ? `<div class="scores">
            ${criteria
              .map((c) => {
                const val = card.scores![c.id];
                if (val == null) return "";
                return `<div class="score-item">
                  <span class="score-label">${c.name}</span>
                  <div class="score-bar-bg">
                    <div class="score-bar" style="width:${val * 10}%;background:${scoreColor(val)}"></div>
                  </div>
                  <span class="score-val" style="color:${scoreColor(val)}">${val}</span>
                </div>`;
              })
              .join("")}
            <div class="score-avg">AVG <span style="color:${scoreColor(Number(avg))}">${avg}</span></div>
          </div>`
        : `<div class="scores no-scores">Not scored</div>`;

      return `<div class="card">
        <div class="card-header">
          <span class="model-name">${card.modelId}</span>
          ${avg ? `<span class="avg-badge" style="background:${scoreColor(Number(avg))}20;color:${scoreColor(Number(avg))}">${avg}</span>` : ""}
        </div>
        <div class="card-iframe-wrapper">
          <iframe srcdoc="${escapeForSrcdoc(card.html)}" sandbox="allow-scripts" loading="lazy"></iframe>
        </div>
        ${scoresHtml}
      </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${benchmarkName} — Eval Studio Showcase</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #09090b;
      color: #e4e4e7;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      min-height: 100vh;
    }

    .header {
      text-align: center;
      padding: 48px 24px 32px;
    }

    .header h1 {
      font-size: 2.5rem;
      font-weight: 700;
      background: linear-gradient(135deg, #3b82f6, #a855f7);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 8px;
    }

    .header .subtitle {
      font-size: 0.95rem;
      color: #71717a;
    }

    .header .meta {
      margin-top: 12px;
      font-size: 0.8rem;
      color: #52525b;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(${cols}, 1fr);
      gap: 20px;
      padding: 0 32px 48px;
      max-width: 1800px;
      margin: 0 auto;
    }

    .card {
      border: 1px solid #27272a;
      border-radius: 12px;
      overflow: hidden;
      background: #18181b;
      display: flex;
      flex-direction: column;
      transition: border-color 0.2s;
    }

    .card:hover {
      border-color: #3f3f46;
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: #1c1c1f;
      border-bottom: 1px solid #27272a;
    }

    .model-name {
      font-size: 0.85rem;
      font-weight: 600;
      color: #d4d4d8;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .avg-badge {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 6px;
      flex-shrink: 0;
    }

    .card-iframe-wrapper {
      position: relative;
      width: 100%;
      aspect-ratio: 4 / 3;
      background: #000;
    }

    .card-iframe-wrapper iframe {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: none;
    }

    .scores {
      padding: 10px 16px 12px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      border-top: 1px solid #27272a;
    }

    .scores.no-scores {
      color: #52525b;
      font-size: 0.75rem;
      text-align: center;
      padding: 8px 16px;
    }

    .score-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .score-label {
      font-size: 0.7rem;
      color: #71717a;
      width: 80px;
      flex-shrink: 0;
    }

    .score-bar-bg {
      flex: 1;
      height: 4px;
      background: #27272a;
      border-radius: 2px;
      overflow: hidden;
    }

    .score-bar {
      height: 100%;
      border-radius: 2px;
      transition: width 0.3s ease;
    }

    .score-val {
      font-size: 0.75rem;
      font-weight: 700;
      width: 24px;
      text-align: right;
      flex-shrink: 0;
    }

    .score-avg {
      text-align: right;
      font-size: 0.7rem;
      color: #71717a;
      font-weight: 600;
      margin-top: 2px;
      padding-top: 4px;
      border-top: 1px solid #27272a;
    }

    .score-avg span {
      font-size: 0.8rem;
      font-weight: 700;
    }

    .footer {
      text-align: center;
      padding: 24px;
      font-size: 0.75rem;
      color: #3f3f46;
      border-top: 1px solid #18181b;
    }

    @media (max-width: 1200px) {
      .grid { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 700px) {
      .grid { grid-template-columns: 1fr; padding: 0 16px 32px; }
      .header h1 { font-size: 1.8rem; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${benchmarkName}</h1>
    <div class="subtitle">Eval Studio — LLM Frontend Benchmark Showcase</div>
    <div class="meta">${cardCount} model${cardCount !== 1 ? "s" : ""} · Exported ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
  </div>

  <div class="grid">
    ${cardsHtml}
  </div>

  <div class="footer">
    Generated by Eval Studio
  </div>
</body>
</html>`;
}
