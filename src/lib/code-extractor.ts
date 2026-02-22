/**
 * Extracts clean code from LLM responses.
 *
 * LLMs (especially local ones via LM Studio) tend to wrap code in markdown
 * fences and add explanatory text before/after. This module strips all of
 * that and returns only the code.
 */

/** Priority-ordered list of fenced code block patterns. */
const FENCE_PATTERNS = [
  // ```html ... ``` (most common for our use case)
  /```html\s*\n([\s\S]*?)```/i,
  // ```htm ... ```
  /```htm\s*\n([\s\S]*?)```/i,
  // ```javascript ... ``` or ```js ... ```
  /```(?:javascript|js)\s*\n([\s\S]*?)```/i,
  // ```css ... ```
  /```css\s*\n([\s\S]*?)```/i,
  // Generic fenced block (no language tag)
  /```\s*\n([\s\S]*?)```/,
];

/**
 * Detects whether a string looks like a complete HTML document.
 * Checks for common markers: doctype, <html>, or <head>/<body> tags.
 */
function looksLikeFullHtml(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return (
    lower.startsWith("<!doctype") ||
    lower.startsWith("<html") ||
    (lower.includes("<head") && lower.includes("<body"))
  );
}

/**
 * Given the raw text output from an LLM, extract the first code block.
 *
 * Strategy:
 * 1. Try each fenced-block regex in priority order.
 * 2. If no fences found, check if the entire response looks like raw HTML.
 * 3. As a last resort, return the full response trimmed.
 */
export function extractCode(raw: string): string {
  const trimmed = raw.trim();

  // 1. Try fenced code blocks in priority order
  for (const pattern of FENCE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  // 2. If the entire response looks like raw HTML (no fences), use it directly
  if (looksLikeFullHtml(trimmed)) {
    return trimmed;
  }

  // 3. Try to find inline HTML: look for the first < that starts a tag
  //    and the last > that closes one
  const firstTag = trimmed.indexOf("<");
  const lastTag = trimmed.lastIndexOf(">");
  if (firstTag !== -1 && lastTag > firstTag) {
    const candidate = trimmed.slice(firstTag, lastTag + 1).trim();
    if (candidate.length > 50 && looksLikeFullHtml(candidate)) {
      return candidate;
    }
  }

  // 4. Fallback — return everything (caller can decide what to do)
  return trimmed;
}

/**
 * Merges multiple extracted blocks into a single HTML file.
 * Useful when a model returns CSS and JS in separate fenced blocks.
 */
export function mergeBlocks(raw: string): string {
  const blocks: string[] = [];
  const globalPattern = /```(?:\w*)\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;

  while ((m = globalPattern.exec(raw)) !== null) {
    blocks.push(m[1].trim());
  }

  if (blocks.length === 0) return extractCode(raw);
  if (blocks.length === 1) return blocks[0];

  // Check if any block is already a full HTML doc
  const fullDoc = blocks.find(looksLikeFullHtml);
  if (fullDoc) return fullDoc;

  // Otherwise concatenate — put CSS in <style>, JS in <script>, rest as body
  let css = "";
  let js = "";
  let html = "";

  for (const block of blocks) {
    const lower = block.trim().toLowerCase();
    if (
      lower.startsWith("body") ||
      lower.startsWith(".") ||
      lower.startsWith("#") ||
      lower.startsWith("*")
    ) {
      css += block + "\n";
    } else if (
      lower.startsWith("function") ||
      lower.startsWith("const ") ||
      lower.startsWith("let ") ||
      lower.startsWith("var ") ||
      lower.startsWith("document.")
    ) {
      js += block + "\n";
    } else {
      html += block + "\n";
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${css ? `<style>\n${css}</style>` : ""}
</head>
<body>
${html}
${js ? `<script>\n${js}</script>` : ""}
</body>
</html>`;
}
