import { readFileSync } from "fs";
import { join } from "path";
import type { ModelConfig } from "./types";
import { getModelStates } from "./lmstudio";

interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  type: "openai" | "anthropic";
}

interface ModelsConfig {
  providers: ProviderConfig[];
  models: ModelConfig[];
}

// Patterns that indicate non-chat models (embeddings, rerankers, etc.)
const SKIP_PATTERNS = [/embed/i, /rerank/i, /whisper/i, /tts/i, /clip/i];

let cachedModels: ModelConfig[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000;

function loadConfig(): ModelsConfig {
  const configPath = join(process.cwd(), "config", "models.json");
  const raw = readFileSync(configPath, "utf-8");
  return JSON.parse(raw);
}

function resolveApiKey(value: string): string {
  if (value.startsWith("env:")) {
    const envVar = value.slice(4);
    return process.env[envVar] ?? "";
  }
  return value;
}

function shouldSkipModel(id: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(id));
}

/**
 * Fetch models from LM Studio's native API for better display names,
 * then map to ModelConfig format.
 */
async function discoverModels(
  provider: ProviderConfig
): Promise<ModelConfig[]> {
  const apiKey = resolveApiKey(provider.apiKey);

  // Use LM Studio's native /api/v1/models for rich metadata
  const models = await getModelStates(provider.baseUrl);

  if (models.length > 0) {
    return models
      .filter((m) => m.type !== "embedding" && !shouldSkipModel(m.key))
      .map((m) => ({
        id: m.key,
        name: m.display_name,
        baseUrl: provider.baseUrl,
        apiKey: apiKey,
        defaultModel: m.key,
        provider: provider.type,
        source: provider.name,
      }));
  }

  // Fallback: OpenAI-compat /v1/models
  const url = `${provider.baseUrl.replace(/\/$/, "")}/models`;
  const headers: Record<string, string> = {};
  if (apiKey && apiKey !== "not-needed") {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const list: { id: string }[] = data.data ?? [];

    return list
      .filter((m) => !shouldSkipModel(m.id))
      .map((m) => ({
        id: m.id,
        name: m.id
          .replace(/^.*\//, "")
          .split(/[-_]+/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
        baseUrl: provider.baseUrl,
        apiKey: apiKey,
        defaultModel: m.id,
        provider: provider.type,
        source: provider.name,
      }));
  } catch {
    return [];
  }
}

/**
 * Load all models: auto-discover from providers + manual entries.
 * Results are cached for 30s.
 */
export async function getModels(): Promise<ModelConfig[]> {
  const now = Date.now();
  if (cachedModels && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedModels;
  }

  const config = loadConfig();

  const discovered = (
    await Promise.all(config.providers.map(discoverModels))
  ).flat();

  const manual = (config.models ?? []).map((m) => ({
    ...m,
    provider: m.provider ?? "openai",
    apiKey: resolveApiKey(m.apiKey),
  }));

  const manualIds = new Set(manual.map((m) => m.id));
  const merged = [
    ...manual,
    ...discovered.filter((m) => !manualIds.has(m.id)),
  ];

  merged.sort((a, b) => a.name.localeCompare(b.name));

  cachedModels = merged;
  cacheTimestamp = now;
  return cachedModels;
}

export async function getModelById(
  id: string
): Promise<ModelConfig | undefined> {
  const models = await getModels();
  return models.find((m) => m.id === id);
}

/** Bust cache — forces re-discovery on next call */
export function reloadModels() {
  cachedModels = null;
  cacheTimestamp = 0;
}
