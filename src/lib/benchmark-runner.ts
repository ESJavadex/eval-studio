import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import type { ModelConfig, BenchmarkInfo } from "./types";
import { extractCode } from "./code-extractor";

/**
 * Lists all available benchmarks by scanning the /benchmarks directory.
 */
export function listBenchmarks(): BenchmarkInfo[] {
  const benchDir = join(process.cwd(), "benchmarks");
  if (!existsSync(benchDir)) return [];

  const entries = readdirSync(benchDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => {
      const promptPath = join(benchDir, e.name, "prompt.txt");
      const prompt = existsSync(promptPath)
        ? readFileSync(promptPath, "utf-8")
        : "";
      return {
        id: e.name,
        name: e.name
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
        prompt,
      };
    })
    .filter((b) => b.prompt.length > 0);
}

/**
 * Calls an OpenAI-compatible chat completions endpoint.
 */
export async function callModel(
  model: ModelConfig,
  prompt: string
): Promise<{ content: string; durationMs: number }> {
  const start = Date.now();

  const url = `${model.baseUrl.replace(/\/$/, "")}/chat/completions`;

  const body = {
    model: model.defaultModel,
    messages: [
      {
        role: "system" as const,
        content:
          "You are an expert frontend developer. Respond ONLY with code inside a single fenced code block (```html). Do not include explanations before or after the code block.",
      },
      {
        role: "user" as const,
        content: prompt,
      },
    ],
    temperature: 0.3,
    max_tokens: 16384,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (model.apiKey && model.apiKey !== "not-needed") {
    headers["Authorization"] = `Bearer ${model.apiKey}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(
      `API error ${res.status} from ${model.name}: ${errorText}`
    );
  }

  const data = await res.json();
  const content =
    data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? "";
  const durationMs = Date.now() - start;

  return { content, durationMs };
}

/**
 * Runs a benchmark against a model: calls the API, extracts code, returns result.
 */
export async function runBenchmark(
  benchmark: BenchmarkInfo,
  model: ModelConfig
): Promise<{
  rawResponse: string;
  extractedCode: string;
  durationMs: number;
}> {
  const { content, durationMs } = await callModel(model, benchmark.prompt);
  const extractedCode = extractCode(content);

  return {
    rawResponse: content,
    extractedCode,
    durationMs,
  };
}
