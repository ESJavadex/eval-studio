"use client";

import { useState, useRef, useEffect } from "react";
import type { RunResult, Score, ScoringCriteria, StreamingState } from "@/lib/types";
import ScorePanel from "./ScorePanel";

interface Props {
  results: RunResult[];
  modelNames: Record<string, string>;
  benchmarkNames: Record<string, string>;
  scores: Score[];
  criteria: ScoringCriteria[];
  onScoreSaved: (score: Score) => void;
  streamingStates?: Record<string, StreamingState>;
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

function StreamingCard({
  modelId,
  modelName,
  state,
}: {
  modelId: string;
  modelName: string;
  state: StreamingState;
}) {
  const preRef = useRef<HTMLPreElement>(null);
  const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(1);

  // Auto-scroll raw text viewer
  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [state.partialContent]);

  return (
    <div className="flex flex-col rounded-lg border border-blue-500/40 overflow-hidden bg-zinc-900 min-h-0">
      {/* Header with pulsing blue dot */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/80 border-b border-blue-500/30">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
          </span>
          <span className="text-sm font-medium text-zinc-200 truncate">
            {modelName}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-2">
          <span className="text-[11px] text-blue-400 font-mono">
            {state.tokenCount} tokens
          </span>
          <span className="text-[11px] text-zinc-500 font-mono">
            {elapsed}s
          </span>
        </div>
      </div>

      {/* Live HTML preview */}
      <div className="flex-1 min-h-[200px]">
        {state.extractedHtml ? (
          <iframe
            srcDoc={state.extractedHtml}
            title={`${modelId}-streaming`}
            className="w-full h-full border-0 bg-white"
            sandbox="allow-scripts"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
            Waiting for code...
          </div>
        )}
      </div>

      {/* Auto-scrolling raw text viewer */}
      <div className="border-t border-zinc-700/50">
        <div className="px-3 py-1.5 text-[11px] text-zinc-500 flex items-center gap-1.5">
          <svg className="w-2.5 h-2.5 rotate-90" fill="currentColor" viewBox="0 0 20 20">
            <path d="M6 4l8 6-8 6V4z" />
          </svg>
          Raw Stream
        </div>
        <pre
          ref={preRef}
          className="px-3 pb-2 max-h-36 overflow-auto text-[11px] text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed"
        >
          {state.partialContent}
        </pre>
      </div>
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
  streamingStates = {},
}: Props) {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const multiBenchmark =
    new Set(successful.map((r) => r.benchmarkId)).size > 1;

  // Models that are streaming but don't have a result yet
  const completedModelIds = new Set(results.map((r) => r.modelId));
  const streamingEntries = Object.entries(streamingStates).filter(
    ([id]) => !completedModelIds.has(id)
  );

  const totalCards = successful.length + streamingEntries.length;

  if (results.length === 0 && streamingEntries.length === 0) {
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
    totalCards === 1
      ? "grid-cols-1"
      : totalCards === 2
        ? "grid-cols-2"
        : totalCards <= 4
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
        {/* Streaming cards (in-progress models) */}
        {streamingEntries.map(([modelId, state]) => (
          <StreamingCard
            key={`streaming-${modelId}`}
            modelId={modelId}
            modelName={modelNames[modelId] ?? modelId}
            state={state}
          />
        ))}

        {/* Completed result cards */}
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
