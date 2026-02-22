export interface ModelConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  provider?: "openai" | "anthropic";
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
