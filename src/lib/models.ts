import { readFileSync } from "fs";
import { join } from "path";
import type { ModelConfig } from "./types";

let cachedModels: ModelConfig[] | null = null;

/**
 * Load model configurations from config/models.json.
 * Resolves "env:VAR_NAME" api key references to actual env values.
 */
export function getModels(): ModelConfig[] {
  if (cachedModels) return cachedModels;

  const configPath = join(process.cwd(), "config", "models.json");
  const raw = readFileSync(configPath, "utf-8");
  const models: ModelConfig[] = JSON.parse(raw);

  cachedModels = models.map((m) => ({
    ...m,
    provider: m.provider ?? "openai",
    apiKey: resolveApiKey(m.apiKey),
  }));

  return cachedModels;
}

export function getModelById(id: string): ModelConfig | undefined {
  return getModels().find((m) => m.id === id);
}

function resolveApiKey(value: string): string {
  if (value.startsWith("env:")) {
    const envVar = value.slice(4);
    return process.env[envVar] ?? "";
  }
  return value;
}

/** Bust cache — useful after editing models.json at runtime */
export function reloadModels(): ModelConfig[] {
  cachedModels = null;
  return getModels();
}
