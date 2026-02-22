"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import BenchmarkList from "@/components/BenchmarkList";
import ModelSelector from "@/components/ModelSelector";
import ResultsGrid from "@/components/ResultsGrid";
import PastResults from "@/components/PastResults";
import TabBar from "@/components/TabBar";
import Scoreboard from "@/components/Scoreboard";
import type { BenchmarkInfo, RunResult, Score, ScoringCriteria } from "@/lib/types";

interface ModelInfo {
  id: string;
  name: string;
  baseUrl: string;
  hasApiKey: boolean;
  defaultModel: string;
  source?: string;
}

interface ModelState {
  loaded: boolean;
  instanceId: string | null;
  displayName: string;
  params: string;
  quantization: string;
  sizeMb: number;
}

export default function Home() {
  const [benchmarks, setBenchmarks] = useState<BenchmarkInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [pastResults, setPastResults] = useState<Record<string, string[]>>({});

  const [selectedBenchmark, setSelectedBenchmark] = useState<string | null>(null);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<RunResult[]>([]);
  const [running, setRunning] = useState(false);
  const [runningModel, setRunningModel] = useState<string | null>(null);
  const [runProgress, setRunProgress] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState("runner");
  const [scores, setScores] = useState<Score[]>([]);
  const [criteria, setCriteria] = useState<ScoringCriteria[]>([]);
  const [promptExpanded, setPromptExpanded] = useState(true);

  // Model management state
  const [modelStates, setModelStates] = useState<Record<string, ModelState>>({});
  const [loadingModels, setLoadingModels] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch model loaded states
  const refreshModelStates = useCallback(async () => {
    try {
      const res = await fetch(
        "/api/model-management?baseUrl=" +
          encodeURIComponent("http://localhost:1234/v1")
      );
      if (res.ok) {
        const states = await res.json();
        setModelStates(states);
      }
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/benchmarks").then((r) => r.json()),
      fetch("/api/models").then((r) => r.json()),
      fetch("/api/results").then((r) => r.json()),
      fetch("/api/scores").then((r) => r.json()),
      fetch("/config/scoring.json")
        .then((r) => r.json())
        .catch(() => []),
    ]).then(([b, m, p, s, c]) => {
      setBenchmarks(b);
      setModels(m);
      setPastResults(p);
      setScores(s);
      setCriteria(c);
    });

    refreshModelStates();
    // Poll every 5s
    pollRef.current = setInterval(refreshModelStates, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refreshModelStates]);

  const modelNames: Record<string, string> = {};
  for (const m of models) {
    modelNames[m.id] = m.name;
  }

  const benchmarkNames: Record<string, string> = {};
  for (const b of benchmarks) {
    benchmarkNames[b.id] = b.name;
  }

  const toggleModel = useCallback((id: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleScoreSaved = (score: Score) => {
    setScores((prev) => {
      const idx = prev.findIndex(
        (s) =>
          s.benchmarkId === score.benchmarkId &&
          s.modelId === score.modelId &&
          s.scoredBy === score.scoredBy
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = score;
        return next;
      }
      return [...prev, score];
    });
  };

  // ---- Model management ----
  const handleLoadModel = async (modelId: string) => {
    setLoadingModels((prev) => new Set(prev).add(modelId));
    try {
      await fetch("/api/model-management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "load",
          modelId,
          baseUrl: "http://localhost:1234/v1",
        }),
      });
    } finally {
      setLoadingModels((prev) => {
        const next = new Set(prev);
        next.delete(modelId);
        return next;
      });
      refreshModelStates();
    }
  };

  const handleUnloadModel = async (modelId: string) => {
    setLoadingModels((prev) => new Set(prev).add(modelId));
    try {
      await fetch("/api/model-management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "unload",
          modelId,
          baseUrl: "http://localhost:1234/v1",
        }),
      });
    } finally {
      setLoadingModels((prev) => {
        const next = new Set(prev);
        next.delete(modelId);
        return next;
      });
      refreshModelStates();
    }
  };

  const handleUnloadAll = async () => {
    setRunProgress("Unloading all models...");
    await fetch("/api/model-management", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "unload-all",
        baseUrl: "http://localhost:1234/v1",
      }),
    });
    setRunProgress(null);
    refreshModelStates();
  };

  // ---- Run benchmark: 1 benchmark × N models (parallel, no unloading) ----
  const runBenchmark = async () => {
    if (!selectedBenchmark || selectedModels.size === 0) return;

    setRunning(true);
    setResults([]);

    const modelIds = Array.from(selectedModels);
    const resultsRef: (RunResult | null)[] = modelIds.map(() => null);
    let completed = 0;

    setRunProgress(
      `Running ${modelIds.length} model${modelIds.length > 1 ? "s" : ""} in parallel...`
    );

    await Promise.allSettled(
      modelIds.map(async (modelId, idx) => {
        try {
          const res = await fetch("/api/run-benchmark", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              benchmarkId: selectedBenchmark,
              modelIds: [modelId],
            }),
          });
          const data = await res.json();
          if (data.results?.[0]) {
            resultsRef[idx] = data.results[0];
          } else {
            resultsRef[idx] = {
              benchmarkId: selectedBenchmark,
              modelId,
              modelName: modelNames[modelId] ?? modelId,
              rawResponse: "",
              extractedCode: "",
              resultPath: "",
              durationMs: 0,
              success: false,
              error: data.error ?? "Empty response from server",
            };
          }
        } catch (err) {
          resultsRef[idx] = {
            benchmarkId: selectedBenchmark,
            modelId,
            modelName: modelNames[modelId] ?? modelId,
            rawResponse: "",
            extractedCode: "",
            resultPath: "",
            durationMs: 0,
            success: false,
            error: err instanceof Error ? err.message : "Network error",
          };
        }
        completed++;
        setRunProgress(`Completed ${completed}/${modelIds.length} models...`);
        setResults(resultsRef.filter((r): r is RunResult => r !== null));
      })
    );

    setResults(resultsRef.filter((r): r is RunResult => r !== null));
    setRunningModel(null);
    setRunning(false);
    setRunProgress(null);

    fetch("/api/results")
      .then((r) => r.json())
      .then(setPastResults);
  };

  // ---- Run all benchmarks for 1 model ----
  // ---- Run all benchmarks for 1 model (sequential) ----
  const runAllBenchmarks = async () => {
    if (selectedModels.size !== 1) return;

    const modelId = Array.from(selectedModels)[0];
    setRunning(true);
    setResults([]);

    const totalBenchmarks = benchmarks.length;
    const allResults: RunResult[] = [];

    for (let i = 0; i < benchmarks.length; i++) {
      const benchmark = benchmarks[i];
      setRunningModel(modelId);
      setRunProgress(
        `Benchmark ${i + 1}/${totalBenchmarks}: ${benchmark.name}`
      );
      setSelectedBenchmark(benchmark.id);

      try {
        const res = await fetch("/api/run-benchmark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            benchmarkId: benchmark.id,
            modelIds: [modelId],
          }),
        });
        const data = await res.json();
        if (data.results) {
          allResults.push(...data.results);
          setResults([...allResults]);
        }
      } catch (err) {
        allResults.push({
          benchmarkId: benchmark.id,
          modelId,
          modelName: modelNames[modelId] ?? modelId,
          rawResponse: "",
          extractedCode: "",
          resultPath: "",
          durationMs: 0,
          success: false,
          error: err instanceof Error ? err.message : "Network error",
        });
        setResults([...allResults]);
      }
    }

    setRunningModel(null);
    setRunning(false);
    setRunProgress(null);

    fetch("/api/results")
      .then((r) => r.json())
      .then(setPastResults);
  };

  const loadPastResult = (benchmarkId: string, modelIds: string[]) => {
    setSelectedBenchmark(benchmarkId);
    setActiveTab("runner");
    setResults(
      modelIds.map((modelId) => ({
        benchmarkId,
        modelId,
        modelName: modelNames[modelId] ?? modelId,
        rawResponse: "",
        extractedCode: "",
        resultPath: `/results/${benchmarkId}/${modelId}/index.html`,
        durationMs: 0,
        success: true,
      }))
    );
  };

  const loadPastResultsByModel = (modelId: string, benchmarkIds: string[]) => {
    setSelectedBenchmark(null);
    setActiveTab("runner");
    setResults(
      benchmarkIds.map((benchmarkId) => ({
        benchmarkId,
        modelId,
        modelName: modelNames[modelId] ?? modelId,
        rawResponse: "",
        extractedCode: "",
        resultPath: `/results/${benchmarkId}/${modelId}/index.html`,
        durationMs: 0,
        success: true,
      }))
    );
  };

  const selectedBenchmarkInfo = benchmarks.find(
    (b) => b.id === selectedBenchmark
  );

  const canRunAll = selectedModels.size === 1 && benchmarks.length > 0;

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-800 p-4 flex flex-col gap-2 overflow-y-auto shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold">
            E
          </div>
          <div>
            <h1 className="text-sm font-bold">Eval Studio</h1>
            <p className="text-[10px] text-zinc-500">LLM Benchmarking</p>
          </div>
        </div>

        <BenchmarkList
          benchmarks={benchmarks}
          selected={selectedBenchmark}
          onSelect={setSelectedBenchmark}
        />

        <PastResults
          pastResults={pastResults}
          modelNames={modelNames}
          onLoad={loadPastResult}
          onLoadByModel={loadPastResultsByModel}
        />
      </aside>

      {/* Main area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <header className="border-b border-zinc-800 px-6 py-3 shrink-0">
          <div className="flex items-start gap-4">
            <ModelSelector
              models={models}
              selected={selectedModels}
              onToggle={toggleModel}
              modelStates={modelStates}
              loadingModels={loadingModels}
              onLoadModel={handleLoadModel}
              onUnloadModel={handleUnloadModel}
              onUnloadAll={handleUnloadAll}
            />

            <div className="shrink-0 flex flex-col items-end gap-2 pt-0.5">
              {running && (
                <span className="text-xs text-zinc-400 animate-pulse whitespace-nowrap">
                  {runProgress ||
                    `Running ${modelNames[runningModel!] ?? runningModel}...`}
                </span>
              )}

              <div className="flex items-center gap-2">
                {canRunAll && (
                  <button
                    onClick={runAllBenchmarks}
                    disabled={running}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                      running
                        ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                        : "bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20"
                    }`}
                  >
                    RUN ALL
                  </button>
                )}

                <button
                  onClick={runBenchmark}
                  disabled={
                    running || !selectedBenchmark || selectedModels.size === 0
                  }
                  className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                    running || !selectedBenchmark || selectedModels.size === 0
                      ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20"
                  }`}
                >
                  {running ? (
                    <span className="flex items-center gap-2">
                      <svg
                        className="animate-spin h-4 w-4"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Running...
                    </span>
                  ) : (
                    "RUN BENCHMARK"
                  )}
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Tab bar */}
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

        {activeTab === "runner" && (
          <>
            {/* Benchmark prompt panel */}
            {selectedBenchmarkInfo && (
              <div className="border-b border-zinc-800/50 bg-zinc-900/50">
                <button
                  onClick={() => setPromptExpanded((p) => !p)}
                  className="w-full px-6 py-2 flex items-center gap-2 hover:bg-zinc-800/30 transition-colors text-left"
                >
                  <svg
                    className={`w-3 h-3 text-zinc-500 transition-transform ${promptExpanded ? "rotate-90" : ""}`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M6 4l8 6-8 6V4z" />
                  </svg>
                  <span className="text-xs font-medium text-zinc-400">
                    Prompt — {selectedBenchmarkInfo.name}
                  </span>
                </button>
                {promptExpanded && (
                  <div className="px-6 pb-3 max-h-60 overflow-y-auto">
                    <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed">
                      {selectedBenchmarkInfo.prompt}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Results */}
            <div className="flex-1 p-4 overflow-auto flex">
              <ResultsGrid
                results={results}
                modelNames={modelNames}
                benchmarkNames={benchmarkNames}
                scores={scores}
                criteria={criteria}
                onScoreSaved={handleScoreSaved}
              />
            </div>
          </>
        )}

        {activeTab === "scoreboard" && (
          <Scoreboard
            scores={scores}
            benchmarks={benchmarks}
            modelNames={modelNames}
          />
        )}
      </main>
    </div>
  );
}
