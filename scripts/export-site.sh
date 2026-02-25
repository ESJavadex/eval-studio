#!/bin/bash
# Export all benchmark results to docs/ for GitHub Pages
# Usage: ./scripts/export-site.sh [base-url]
#
# Requires the dev or production server to be running.

BASE_URL="${1:-http://localhost:3333}"
DOCS_DIR="$(cd "$(dirname "$0")/.." && pwd)/docs"

echo "Exporting site to $DOCS_DIR from $BASE_URL ..."

# Fetch benchmark results to get model counts
RESULTS=$(curl -sf "$BASE_URL/api/results")
if [ $? -ne 0 ]; then
  echo "ERROR: Could not reach $BASE_URL/api/results — is the server running?"
  exit 1
fi

mkdir -p "$DOCS_DIR"

# Get benchmark IDs and model counts
BENCHMARKS=$(echo "$RESULTS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for k in sorted(data.keys()):
    print(f'{k}\t{len(data[k])}')
")

TOTAL_MODELS=0
BENCH_COUNT=0

# Export each benchmark
while IFS=$'\t' read -r bench_id model_count; do
  echo "  Exporting $bench_id ($model_count models)..."
  curl -sf "$BASE_URL/api/export-html?benchmarkId=$bench_id" -o "$DOCS_DIR/$bench_id.html"
  if [ $? -ne 0 ]; then
    echo "    WARN: Failed to export $bench_id"
    continue
  fi
  size=$(wc -c < "$DOCS_DIR/$bench_id.html")
  echo "    -> $size bytes"
  TOTAL_MODELS=$((TOTAL_MODELS + model_count))
  BENCH_COUNT=$((BENCH_COUNT + 1))
done <<< "$BENCHMARKS"

echo ""
echo "Generating index.html ($BENCH_COUNT benchmarks, $TOTAL_MODELS total runs)..."

# Benchmark metadata for the index page
DESCRIPTIONS=$(cat <<'DESCEOF'
svg-illustration|SVG Illustration|Animated solar system with orbiting planets, starfield background, and SVG animations. Tests complex SVG generation and CSS animation skills.
css-art-mondrian|CSS Art Mondrian|Piet Mondrian-inspired grid composition using pure CSS. Tests layout, color theory, and creative CSS usage.
interactive-counter|Interactive Counter|Functional counter with increment/decrement buttons and state management. Tests JavaScript interactivity and UI design.
hello-world|Hello World|A styled "Hello World" page. The simplest benchmark — tests basic HTML/CSS output and instruction following.
isotope-calendar|Isotope Calendar|Interactive calendar component with date navigation. Tests complex layout, date logic, and UI state management.
mermaid-diagram|Mermaid Diagram|Flowchart or diagram rendered from Mermaid-style syntax. Tests structured visual output generation.
DESCEOF
)

# Build card HTML
CARDS_HTML=""
while IFS=$'\t' read -r bench_id model_count; do
  # Look up title and description
  LINE=$(echo "$DESCRIPTIONS" | grep "^$bench_id|" || echo "$bench_id|$(echo $bench_id | sed 's/-/ /g; s/\b\(.\)/\u\1/g')|Benchmark results")
  TITLE=$(echo "$LINE" | cut -d'|' -f2)
  DESC=$(echo "$LINE" | cut -d'|' -f3)
  MODELS_LABEL="$model_count model"
  [ "$model_count" != "1" ] && MODELS_LABEL="${model_count} models"

  CARDS_HTML="${CARDS_HTML}
    <a href=\"${bench_id}.html\" class=\"card\">
      <div class=\"card-visual\">
        <iframe src=\"${bench_id}.html\" loading=\"lazy\" sandbox=\"allow-scripts\" tabindex=\"-1\"></iframe>
        <div class=\"overlay\"></div>
      </div>
      <div class=\"card-body\">
        <h2>${TITLE}</h2>
        <div class=\"desc\">${DESC}</div>
        <div class=\"card-footer\">
          <span class=\"badge\">${MODELS_LABEL}</span>
          <span class=\"arrow\">&rarr;</span>
        </div>
      </div>
    </a>"
done <<< "$BENCHMARKS"

MONTH=$(LC_TIME=en_US.UTF-8 date +"%B %Y")

cat > "$DOCS_DIR/index.html" <<INDEXEOF
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Eval Studio — LLM Frontend Benchmark Results</title>
  <meta name="description" content="Compare how local LLMs generate HTML, CSS, SVG, and interactive web components. Open-source benchmarking tool.">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #09090b;
      color: #e4e4e7;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      min-height: 100vh;
    }

    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }

    .hero {
      text-align: center;
      padding: 80px 24px 32px;
    }

    .hero .logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 64px;
      height: 64px;
      border-radius: 16px;
      background: linear-gradient(135deg, #3b82f6, #a855f7);
      font-size: 1.8rem;
      font-weight: 800;
      color: white;
      margin-bottom: 24px;
    }

    .hero h1 {
      font-size: 3rem;
      font-weight: 800;
      background: linear-gradient(135deg, #3b82f6, #a855f7, #ec4899);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 12px;
      line-height: 1.1;
    }

    .hero .subtitle {
      font-size: 1.15rem;
      color: #a1a1aa;
      max-width: 600px;
      margin: 0 auto 16px;
      line-height: 1.5;
    }

    .hero .meta {
      font-size: 0.85rem;
      color: #52525b;
      margin-bottom: 20px;
    }

    .hero .gh-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      border-radius: 10px;
      background: #18181b;
      border: 1px solid #27272a;
      color: #e4e4e7;
      font-size: 0.9rem;
      font-weight: 600;
      text-decoration: none;
      transition: border-color 0.2s, background 0.2s;
    }

    .hero .gh-link:hover {
      border-color: #3b82f6;
      background: #1c1c1f;
      text-decoration: none;
    }

    .hero .gh-link svg {
      width: 20px;
      height: 20px;
      fill: #e4e4e7;
    }

    /* Features section */
    .features {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 16px;
      padding: 0 48px 48px;
      max-width: 1200px;
      margin: 0 auto;
    }

    .feature {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 20px;
    }

    .feature .icon {
      font-size: 1.5rem;
      margin-bottom: 8px;
    }

    .feature h3 {
      font-size: 0.95rem;
      font-weight: 700;
      color: #f4f4f5;
      margin-bottom: 6px;
    }

    .feature p {
      font-size: 0.8rem;
      color: #71717a;
      line-height: 1.5;
    }

    .section-title {
      text-align: center;
      font-size: 1.5rem;
      font-weight: 700;
      color: #f4f4f5;
      padding: 32px 24px 24px;
      max-width: 1200px;
      margin: 0 auto;
    }

    /* Screenshots */
    .screenshots {
      padding: 0 48px 48px;
      max-width: 1200px;
      margin: 0 auto;
    }

    .screenshots .gallery {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
      gap: 16px;
    }

    .screenshots .shot {
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #27272a;
      background: #18181b;
    }

    .screenshots .shot img {
      width: 100%;
      display: block;
    }

    .screenshots .shot .caption {
      padding: 10px 14px;
      font-size: 0.8rem;
      color: #71717a;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 24px;
      padding: 0 48px 64px;
      max-width: 1200px;
      margin: 0 auto;
    }

    .card {
      border: 1px solid #27272a;
      border-radius: 16px;
      overflow: hidden;
      background: #18181b;
      transition: border-color 0.25s, transform 0.25s;
      text-decoration: none;
      color: inherit;
      display: flex;
      flex-direction: column;
    }

    .card:hover {
      border-color: #3b82f6;
      transform: translateY(-4px);
    }

    .card:hover { text-decoration: none; }

    .card-visual {
      height: 200px;
      overflow: hidden;
      position: relative;
      background: #000;
    }

    .card-visual iframe {
      width: 200%;
      height: 200%;
      border: none;
      transform: scale(0.5);
      transform-origin: top left;
      pointer-events: none;
    }

    .card-visual .overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(to bottom, transparent 60%, #18181b);
    }

    .card-body {
      padding: 20px 24px 24px;
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .card-body h2 {
      font-size: 1.3rem;
      font-weight: 700;
      color: #f4f4f5;
      margin-bottom: 8px;
    }

    .card-body .desc {
      font-size: 0.85rem;
      color: #71717a;
      margin-bottom: 16px;
      line-height: 1.5;
      flex: 1;
    }

    .card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .badge {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 8px;
      background: #3b82f620;
      color: #60a5fa;
    }

    .arrow {
      font-size: 1.2rem;
      color: #3f3f46;
      transition: color 0.2s, transform 0.2s;
    }

    .card:hover .arrow {
      color: #3b82f6;
      transform: translateX(4px);
    }

    .footer {
      text-align: center;
      padding: 32px 24px;
      font-size: 0.8rem;
      color: #3f3f46;
      border-top: 1px solid #18181b;
    }

    @media (max-width: 700px) {
      .hero h1 { font-size: 2rem; }
      .grid { padding: 0 16px 48px; grid-template-columns: 1fr; }
      .features { padding: 0 16px 32px; grid-template-columns: 1fr; }
      .screenshots .gallery { grid-template-columns: 1fr; }
      .screenshots { padding: 0 16px 32px; }
    }
  </style>
</head>
<body>
  <div class="hero">
    <div class="logo">E</div>
    <h1>Eval Studio</h1>
    <div class="subtitle">
      LLM Frontend Benchmark Results — comparing how local language models generate HTML, CSS, SVG, and interactive web components.
    </div>
    <div class="meta">${BENCH_COUNT} benchmarks · ${TOTAL_MODELS} total runs · Updated ${MONTH}</div>
    <a href="https://github.com/ESJavadex/eval-studio" class="gh-link" target="_blank" rel="noopener">
      <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      View on GitHub
    </a>
  </div>

  <div class="features">
    <div class="feature">
      <div class="icon">&#x1F3AF;</div>
      <h3>Multi-Model Comparison</h3>
      <p>Run the same prompt against multiple local LLMs simultaneously and compare their HTML/CSS/JS output side by side.</p>
    </div>
    <div class="feature">
      <div class="icon">&#x1F50D;</div>
      <h3>Live Streaming</h3>
      <p>Watch tokens stream in real-time with SSE. See each model's output build up live in sandboxed iframes.</p>
    </div>
    <div class="feature">
      <div class="icon">&#x2B50;</div>
      <h3>Manual Scoring</h3>
      <p>Rate each model on Instructions, Functionality, Aesthetics, and Code Quality with a built-in scoring panel.</p>
    </div>
    <div class="feature">
      <div class="icon">&#x1F4CA;</div>
      <h3>Aggregate Scoreboard</h3>
      <p>View a model x benchmark matrix with color-coded scores and averages to find the best performer overall.</p>
    </div>
  </div>

  <div class="screenshots">
    <div class="gallery">
      <div class="shot">
        <img src="screenshots/runner.png" alt="Eval Studio Runner Panel" onerror="this.parentElement.style.display='none'">
        <div class="caption">Runner panel — select benchmarks and models, run evaluations, view streaming results</div>
      </div>
      <div class="shot">
        <img src="screenshots/scoreboard.png" alt="Eval Studio Scoreboard" onerror="this.parentElement.style.display='none'">
        <div class="caption">Scoreboard — aggregate model x benchmark scoring matrix</div>
      </div>
    </div>
  </div>

  <h2 class="section-title">Benchmark Results</h2>

  <div class="grid">
${CARDS_HTML}
  </div>

  <div class="footer">
    Built with <a href="https://github.com/ESJavadex/eval-studio">Eval Studio</a> — Open-source LLM Frontend Benchmarking Tool
  </div>
</body>
</html>
INDEXEOF

echo ""
echo "Done! Exported $BENCH_COUNT benchmarks ($TOTAL_MODELS total model runs) to $DOCS_DIR/"
echo "Files:"
ls -lh "$DOCS_DIR"/*.html | awk '{print "  " $NF " (" $5 ")"}'
