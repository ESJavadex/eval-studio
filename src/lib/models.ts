import { readFileSync } from "fs";
import { join } from "path";
import type { ModelConfig } from "./types";

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
const SKIP_PATTERNS = [
  /embed/i,
  /rerank/i,
  /whisper/i,
  /tts/i,
  /clip/i,
];

let cachedModels: ModelConfig[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // refresh every 30s

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

function modelIdToName(id: string): string {
  return id
    .replace(/^.*\//, "") // strip org prefix like "zai-org/"
    .split(/[-_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function shouldSkipModel(id: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(id));
}

/**
 * Fetch models from an OpenAI-compatible /v1/models endpoint.
 */
async function discoverModels(provider: ProviderConfig): Promise<ModelConfig[]> {
  const url = `${provider.baseUrl.replace(/\/$/, "")}/models`;
  const headers: Record<string, string> = {};
  const apiKey = resolveApiKey(provider.apiKey);

  if (apiKey && apiKey !== "not-needed") {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];

    const data = await res.json();
    const models: { id: string }[] = data.data ?? [];

    return models
      .filter((m) => !shouldSkipModel(m.id))
      .map((m) => ({
        id: m.id,
        name: modelIdToName(m.id),
        baseUrl: provider.baseUrl,
        apiKey: apiKey,
        defaultModel: m.id,
        provider: provider.type,
        source: provider.name,
      }));
  } catch {
    // Provider offline — silently skip
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

  // Discover from all providers in parallel
  const discovered = (
    await Promise.all(config.providers.map(discoverModels))
  ).flat();

  // Manual models with resolved keys
  const manual = (config.models ?? []).map((m) => ({
    ...m,
    provider: m.provider ?? "openai",
    apiKey: resolveApiKey(m.apiKey),
  }));

  // Manual entries override discovered ones by id
  const manualIds = new Set(manual.map((m) => m.id));
  const merged = [
    ...manual,
    ...discovered.filter((m) => !manualIds.has(m.id)),
  ];

  // Sort alphabetically by name
  merged.sort((a, b) => a.name.localeCompare(b.name));

  cachedModels = merged;
  cacheTimestamp = now;
  return cachedModels;
}

export async function getModelById(id: string): Promise<ModelConfig | undefined> {
  const models = await getModels();
  return models.find((m) => m.id === id);
}

/** Bust cache — forces re-discovery on next call */
export function reloadModels() {
  cachedModels = null;
  cacheTimestamp = 0;
}
