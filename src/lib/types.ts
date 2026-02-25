export interface ModelConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  provider?: "openai" | "anthropic";
  source?: string;
}

export interface BenchmarkInfo {
  id: string;
  name: string;
  prompt: string;
}

export interface RunResult {
  benchmarkId: string;
  modelId: string;
  modelName: string;
  rawResponse: string;
  extractedCode: string;
  resultPath: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface Score {
  benchmarkId: string;
  modelId: string;
  scores: Record<string, number>;
  notes: string;
  scoredBy: string;
  timestamp: number;
}

export interface ScoringCriteria {
  id: string;
  name: string;
  description: string;
  min: number;
  max: number;
}

export interface StreamingState {
  partialContent: string;
  extractedHtml: string;
  tokenCount: number;
  startTime: number;
}

/**
 * Sanitize a model ID for use as a filesystem directory name.
 * Replaces slashes with double-dashes to avoid nested directories.
 */
export function safeModelDir(modelId: string): string {
  return modelId.replace(/\//g, "--");
}
