/**
 * Extracts clean code from LLM responses.
 *
 * LLMs (especially local ones via LM Studio) tend to wrap code in markdown
 * fences and add explanatory text before/after. This module strips all of
 * that and returns only the code.
 */

/** Strip <think>...</think> blocks that thinking models emit. */
function stripThinkBlocks(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

/** Extract content from <answer>...</answer> if present. */
function extractAnswerBlock(text: string): string | null {
  const match = text.match(/<answer>([\s\S]*?)<\/answer>/i);
  return match?.[1]?.trim() ?? null;
}

/**
 * Find the LAST html fenced code block that contains a full HTML document.
 * Falls back to the last html fence, then any last fence.
 */
function findLastHtmlFence(text: string): string | null {
  // Collect all html fenced blocks
  const htmlFences: string[] = [];
  const htmlPattern = /```html\s*\n([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = htmlPattern.exec(text)) !== null) {
    htmlFences.push(m[1].trim());
  }

  if (htmlFences.length > 0) {
    // Prefer the last one that looks like a full document
    const fullDoc = [...htmlFences].reverse().find(looksLikeFullHtml);
    return fullDoc ?? htmlFences[htmlFences.length - 1];
  }
  return null;
}

/** Priority-ordered list of fenced code block patterns (finds first match). */
const FENCE_PATTERNS = [
  /```html\s*\n([\s\S]*?)```/i,
  /```htm\s*\n([\s\S]*?)```/i,
  /```(?:javascript|js)\s*\n([\s\S]*?)```/i,
  /```css\s*\n([\s\S]*?)```/i,
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
 * Given the raw text output from an LLM, extract the final code block.
 *
 * Strategy:
 * 1. Strip <think> blocks.
 * 2. If <answer> block exists, extract code from that only.
 * 3. Prefer the LAST html fence that looks like a full document.
 * 4. Fall back to first fence match, raw HTML detection, etc.
 */
export function extractCode(raw: string): string {
  const stripped = stripThinkBlocks(raw);

  // 1. If <answer>...</answer> exists, extract from that block only
  const answerBlock = extractAnswerBlock(stripped);
  if (answerBlock) {
    return extractFromText(answerBlock);
  }

  // 2. Otherwise extract from the full (think-stripped) text
  return extractFromText(stripped);
}

/** Core extraction logic operating on clean text. */
function extractFromText(text: string): string {
  const trimmed = text.trim();

  // 1. Prefer the last html fence with a full document
  const lastHtml = findLastHtmlFence(trimmed);
  if (lastHtml) return lastHtml;

  // 2. Try other fenced code blocks in priority order
  for (const pattern of FENCE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  // 3. If the entire response looks like raw HTML (no fences), use it directly
  if (looksLikeFullHtml(trimmed)) {
    return trimmed;
  }

  // 4. Try to find inline HTML
  const firstTag = trimmed.indexOf("<");
  const lastTag = trimmed.lastIndexOf(">");
  if (firstTag !== -1 && lastTag > firstTag) {
    const candidate = trimmed.slice(firstTag, lastTag + 1).trim();
    if (candidate.length > 50 && looksLikeFullHtml(candidate)) {
      return candidate;
    }
  }

  // 5. Fallback
  return trimmed;
}

/**
 * Merges multiple extracted blocks into a single HTML file.
 * Useful when a model returns CSS and JS in separate fenced blocks.
 */
export function mergeBlocks(raw: string): string {
  const blocks: string[] = [];
  const cleaned = stripThinkBlocks(raw);
  const globalPattern = /```(?:\w*)\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;

  while ((m = globalPattern.exec(cleaned)) !== null) {
    blocks.push(m[1].trim());
  }

  if (blocks.length === 0) return extractCode(cleaned);
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
