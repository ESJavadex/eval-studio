"use client";

import type { Score, BenchmarkInfo } from "@/lib/types";

interface Props {
  scores: Score[];
  benchmarks: BenchmarkInfo[];
  modelNames: Record<string, string>;
}

function colorClass(avg: number): string {
  if (avg >= 7) return "bg-green-900/40 text-green-400";
  if (avg >= 4) return "bg-yellow-900/40 text-yellow-400";
  return "bg-red-900/40 text-red-400";
}

export default function Scoreboard({ scores, benchmarks, modelNames }: Props) {
  // Get unique model IDs from scores
  const modelIds = [...new Set(scores.map((s) => s.modelId))];
  const benchmarkIds = benchmarks.map((b) => b.id);

  if (scores.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500">
        <div className="text-center">
          <div className="text-4xl mb-3">&#x2606;</div>
          <p className="text-lg">No scores yet</p>
          <p className="text-sm mt-1">
            Run benchmarks and score results to see the scoreboard
          </p>
        </div>
      </div>
    );
  }

  // Build lookup: scores[modelId][benchmarkId] = average score
  const lookup: Record<string, Record<string, number>> = {};
  for (const s of scores) {
    if (!lookup[s.modelId]) lookup[s.modelId] = {};
    const vals = Object.values(s.scores);
    const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    lookup[s.modelId][s.benchmarkId] = avg;
  }

  // Model averages (across all benchmarks)
  const modelAvgs: Record<string, number> = {};
  for (const modelId of modelIds) {
    const vals = Object.values(lookup[modelId] || {});
    modelAvgs[modelId] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }

  // Benchmark averages (across all models)
  const benchmarkAvgs: Record<string, number> = {};
  for (const bId of benchmarkIds) {
    const vals = modelIds
      .map((mId) => lookup[mId]?.[bId])
      .filter((v): v is number => v !== undefined);
    benchmarkAvgs[bId] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }

  // Sort models by average (descending)
  const sortedModels = [...modelIds].sort(
    (a, b) => (modelAvgs[b] || 0) - (modelAvgs[a] || 0)
  );

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left px-3 py-2 text-zinc-400 font-medium border-b border-zinc-800 sticky left-0 bg-zinc-950 z-10">
                Model
              </th>
              {benchmarkIds.map((bId) => {
                const b = benchmarks.find((x) => x.id === bId);
                return (
                  <th
                    key={bId}
                    className="px-3 py-2 text-zinc-400 font-medium border-b border-zinc-800 text-center whitespace-nowrap"
                  >
                    {b?.name || bId}
                  </th>
                );
              })}
              <th className="px-3 py-2 text-zinc-400 font-medium border-b border-zinc-800 text-center">
                Avg
              </th>
              <th className="px-3 py-2 text-zinc-400 font-medium border-b border-zinc-800 text-center">
                Accuracy
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedModels.map((modelId) => (
              <tr key={modelId} className="hover:bg-zinc-900/50">
                <td className="px-3 py-2 font-medium text-zinc-200 border-b border-zinc-800/50 sticky left-0 bg-zinc-950 z-10 whitespace-nowrap">
                  {modelNames[modelId] || modelId}
                </td>
                {benchmarkIds.map((bId) => {
                  const val = lookup[modelId]?.[bId];
                  return (
                    <td
                      key={bId}
                      className="px-3 py-2 text-center border-b border-zinc-800/50"
                    >
                      {val !== undefined ? (
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${colorClass(val)}`}
                        >
                          {val.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-zinc-600 text-xs">--</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-center border-b border-zinc-800/50">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${colorClass(modelAvgs[modelId])}`}
                  >
                    {modelAvgs[modelId].toFixed(1)}
                  </span>
                </td>
                <td className="px-3 py-2 text-center border-b border-zinc-800/50">
                  <span className="text-xs font-bold text-zinc-300">
                    {((modelAvgs[modelId] / 10) * 100).toFixed(0)}%
                  </span>
                </td>
              </tr>
            ))}

            {/* Benchmark average row */}
            <tr className="border-t-2 border-zinc-700">
              <td className="px-3 py-2 font-medium text-zinc-400 italic sticky left-0 bg-zinc-950 z-10">
                Benchmark Avg
              </td>
              {benchmarkIds.map((bId) => {
                const val = benchmarkAvgs[bId];
                return (
                  <td key={bId} className="px-3 py-2 text-center">
                    {val > 0 ? (
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${colorClass(val)}`}
                      >
                        {val.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-zinc-600 text-xs">--</span>
                    )}
                  </td>
                );
              })}
              <td className="px-3 py-2" />
              <td className="px-3 py-2" />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
