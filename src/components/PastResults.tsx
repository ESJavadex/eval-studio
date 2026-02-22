"use client";

import { useState } from "react";

interface Props {
  pastResults: Record<string, string[]>;
  modelNames: Record<string, string>;
  onLoad: (benchmarkId: string, modelIds: string[]) => void;
  onLoadByModel: (modelId: string, benchmarkIds: string[]) => void;
}

export default function PastResults({
  pastResults,
  modelNames,
  onLoad,
  onLoadByModel,
}: Props) {
  const [view, setView] = useState<"benchmark" | "model">("benchmark");

  const entries = Object.entries(pastResults).filter(
    ([, models]) => models.length > 0
  );

  if (entries.length === 0) return null;

  // Build model -> benchmarks[] mapping
  const byModel: Record<string, string[]> = {};
  for (const [benchmarkId, modelIds] of entries) {
    for (const modelId of modelIds) {
      if (!byModel[modelId]) byModel[modelId] = [];
      byModel[modelId].push(benchmarkId);
    }
  }
  const modelEntries = Object.entries(byModel).sort(([a], [b]) =>
    (modelNames[a] || a).localeCompare(modelNames[b] || b)
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-2 mt-4 mb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Past Results
        </h2>
        <div className="flex gap-1">
          <button
            onClick={() => setView("benchmark")}
            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              view === "benchmark"
                ? "bg-zinc-700 text-zinc-200"
                : "text-zinc-500 hover:text-zinc-400"
            }`}
          >
            By Bench
          </button>
          <button
            onClick={() => setView("model")}
            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              view === "model"
                ? "bg-zinc-700 text-zinc-200"
                : "text-zinc-500 hover:text-zinc-400"
            }`}
          >
            By Model
          </button>
        </div>
      </div>

      {view === "benchmark" &&
        entries.map(([benchmarkId, modelIds]) => (
          <button
            key={benchmarkId}
            onClick={() => onLoad(benchmarkId, modelIds)}
            className="text-left px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800 border border-transparent transition-colors"
          >
            <span className="text-zinc-300">{benchmarkId}</span>
            <span className="text-xs text-zinc-500 ml-2">
              ({modelIds.length} model{modelIds.length !== 1 ? "s" : ""})
            </span>
          </button>
        ))}

      {view === "model" &&
        modelEntries.map(([modelId, benchmarkIds]) => (
          <button
            key={modelId}
            onClick={() => onLoadByModel(modelId, benchmarkIds)}
            className="text-left px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800 border border-transparent transition-colors"
          >
            <span className="text-zinc-300 block truncate">
              {modelNames[modelId] || modelId}
            </span>
            <span className="text-xs text-zinc-500">
              {benchmarkIds.length} benchmark{benchmarkIds.length !== 1 ? "s" : ""}
            </span>
          </button>
        ))}
    </div>
  );
}
