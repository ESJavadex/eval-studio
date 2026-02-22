"use client";

interface Props {
  pastResults: Record<string, string[]>;
  modelNames: Record<string, string>;
  onLoad: (benchmarkId: string, modelIds: string[]) => void;
}

export default function PastResults({
  pastResults,
  modelNames,
  onLoad,
}: Props) {
  const entries = Object.entries(pastResults).filter(
    ([, models]) => models.length > 0
  );

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2 px-2 mt-4">
        Past Results
      </h2>
      {entries.map(([benchmarkId, modelIds]) => (
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
    </div>
  );
}
