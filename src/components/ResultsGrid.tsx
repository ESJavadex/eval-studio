"use client";

import type { RunResult, Score, ScoringCriteria } from "@/lib/types";
import ScorePanel from "./ScorePanel";

interface Props {
  results: RunResult[];
  modelNames: Record<string, string>;
  scores: Score[];
  criteria: ScoringCriteria[];
  onScoreSaved: (score: Score) => void;
}

export default function ResultsGrid({
  results,
  modelNames,
  scores,
  criteria,
  onScoreSaved,
}: Props) {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  if (results.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500">
        <div className="text-center">
          <div className="text-4xl mb-3">&#x25A1;</div>
          <p className="text-lg">Select a benchmark and models to begin</p>
          <p className="text-sm mt-1">
            Results will appear here after execution
          </p>
        </div>
      </div>
    );
  }

  // Determine grid columns based on number of results
  const cols =
    successful.length === 1
      ? "grid-cols-1"
      : successful.length === 2
        ? "grid-cols-2"
        : successful.length <= 4
          ? "grid-cols-2"
          : "grid-cols-3";

  return (
    <div className="flex-1 flex flex-col gap-3 overflow-auto">
      {failed.length > 0 && (
        <div className="flex flex-col gap-2">
          {failed.map((r) => (
            <div
              key={r.modelId}
              className="bg-red-950/30 border border-red-500/30 rounded-lg px-4 py-2 text-sm text-red-400"
            >
              <span className="font-medium">
                {modelNames[r.modelId] ?? r.modelId}
              </span>
              : {r.error}
            </div>
          ))}
        </div>
      )}
      <div className={`grid ${cols} gap-3 flex-1`}>
        {successful.map((r) => (
          <div
            key={`${r.benchmarkId}-${r.modelId}`}
            className="flex flex-col rounded-lg border border-zinc-700 overflow-hidden bg-zinc-900 min-h-0"
          >
            <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/80 border-b border-zinc-700">
              <span className="text-sm font-medium text-zinc-200">
                {modelNames[r.modelId] ?? r.modelId}
              </span>
              <span className="text-xs text-zinc-500">
                {r.durationMs > 0
                  ? `${(r.durationMs / 1000).toFixed(1)}s`
                  : ""}
              </span>
            </div>
            <div className="flex-1 min-h-[300px]">
              <iframe
                src={r.resultPath}
                title={r.modelId}
                className="w-full h-full border-0 bg-white"
                sandbox="allow-scripts"
              />
            </div>
            <ScorePanel
              benchmarkId={r.benchmarkId}
              modelId={r.modelId}
              existingScores={scores}
              criteria={criteria}
              onScoreSaved={onScoreSaved}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
