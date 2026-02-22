"use client";

import { useState } from "react";
import type { RunResult, Score, ScoringCriteria } from "@/lib/types";
import ScorePanel from "./ScorePanel";

interface Props {
  results: RunResult[];
  modelNames: Record<string, string>;
  benchmarkNames: Record<string, string>;
  scores: Score[];
  criteria: ScoringCriteria[];
  onScoreSaved: (score: Score) => void;
}

function RawResponseViewer({
  result,
}: {
  result: RunResult;
}) {
  const [content, setContent] = useState<string | null>(
    result.rawResponse || null
  );
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (content) return;
    setLoading(true);
    try {
      // Derive raw-response.txt path from resultPath
      const txtPath = result.resultPath.replace("/index.html", "/raw-response.txt");
      const res = await fetch(txtPath);
      if (res.ok) {
        setContent(await res.text());
      } else {
        setContent("(raw response file not found)");
      }
    } catch {
      setContent("(failed to load raw response)");
    }
    setLoading(false);
  };

  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-zinc-700/50">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!content) load();
        }}
        className="w-full px-3 py-1.5 flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-400 hover:bg-zinc-800/30 transition-colors"
      >
        <svg
          className={`w-2.5 h-2.5 transition-transform ${open ? "rotate-90" : ""}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M6 4l8 6-8 6V4z" />
        </svg>
        Raw Response
      </button>
      {open && (
        <div className="px-3 pb-2 max-h-48 overflow-auto">
          {loading ? (
            <span className="text-[11px] text-zinc-500 animate-pulse">
              Loading...
            </span>
          ) : (
            <pre className="text-[11px] text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed">
              {content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default function ResultsGrid({
  results,
  modelNames,
  benchmarkNames,
  scores,
  criteria,
  onScoreSaved,
}: Props) {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const multiBenchmark =
    new Set(successful.map((r) => r.benchmarkId)).size > 1;

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
              key={`${r.benchmarkId}-${r.modelId}`}
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
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-zinc-200 truncate">
                  {modelNames[r.modelId] ?? r.modelId}
                </span>
                {multiBenchmark && (
                  <span className="text-[11px] text-zinc-500 truncate">
                    {benchmarkNames[r.benchmarkId] ?? r.benchmarkId}
                  </span>
                )}
              </div>
              <span className="text-xs text-zinc-500 shrink-0 ml-2">
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
            <RawResponseViewer result={r} />
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
