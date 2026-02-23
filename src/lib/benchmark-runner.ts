import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import type { ModelConfig, BenchmarkInfo } from "./types";
import { extractCode, extractCodePartial } from "./code-extractor";

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
 * Calls an OpenAI-compatible chat completions endpoint using STREAMING.
 *
 * Streaming keeps the connection alive with continuous token flow,
 * preventing Node.js/Next.js idle body timeouts (~300s) from killing
 * long-running inference on CPU.
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
    stream: true,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (model.apiKey && model.apiKey !== "not-needed") {
    headers["Authorization"] = `Bearer ${model.apiKey}`;
  }

  const payload = JSON.stringify(body);

  // Retry once on connection failure (LM Studio can drop under concurrent load)
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: payload,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `API error ${res.status} from ${model.name}: ${errorText}`
        );
      }

      // Read the SSE stream and accumulate content
      const content = await readSSEStream(res);
      const durationMs = Date.now() - start;

      return { content, durationMs };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Only retry on connection/network errors, not API errors
      if (lastError.message.startsWith("API error")) throw lastError;
      // Wait 2s before retry
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  throw lastError!;
}

/**
 * Async generator that yields individual token deltas from an OpenAI-compatible
 * SSE stream. Each SSE event is `data: {...}` with `choices[0].delta.content`.
 * Stream ends with `data: [DONE]`.
 */
async function* streamTokens(res: Response): AsyncGenerator<string> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body to stream");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete lines from buffer
    const lines = buffer.split("\n");
    // Keep the last (potentially incomplete) line in the buffer
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;
      if (trimmed === "data: [DONE]") continue;
      if (!trimmed.startsWith("data: ")) continue;

      try {
        const json = JSON.parse(trimmed.slice(6));
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // Skip malformed JSON lines
      }
    }
  }
}

/**
 * Reads an SSE stream and returns the full accumulated content.
 * Uses the streamTokens generator internally.
 */
async function readSSEStream(res: Response): Promise<string> {
  let content = "";
  for await (const delta of streamTokens(res)) {
    content += delta;
  }
  return content;
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

/**
 * Streaming version of callModel that yields each token delta.
 * Returns the full content and duration after the stream is consumed.
 */
export async function* callModelStreaming(
  model: ModelConfig,
  prompt: string
): AsyncGenerator<string, { content: string; durationMs: number }> {
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
    stream: true,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (model.apiKey && model.apiKey !== "not-needed") {
    headers["Authorization"] = `Bearer ${model.apiKey}`;
  }

  const payload = JSON.stringify(body);

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: payload,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `API error ${res.status} from ${model.name}: ${errorText}`
        );
      }

      let content = "";
      for await (const delta of streamTokens(res)) {
        content += delta;
        yield delta;
      }

      const durationMs = Date.now() - start;
      return { content, durationMs };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.message.startsWith("API error")) throw lastError;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  throw lastError!;
}

/**
 * Streaming version of runBenchmark that yields token deltas,
 * then returns the final result.
 */
export async function* runBenchmarkStreaming(
  benchmark: BenchmarkInfo,
  model: ModelConfig
): AsyncGenerator<
  string,
  { rawResponse: string; extractedCode: string; durationMs: number }
> {
  const gen = callModelStreaming(model, benchmark.prompt);

  let result = await gen.next();
  while (!result.done) {
    yield result.value;
    result = await gen.next();
  }

  // result.value is the return value from callModelStreaming
  const { content, durationMs } = result.value;
  const extractedCode = extractCode(content);

  return {
    rawResponse: content,
    extractedCode,
    durationMs,
  };
}
