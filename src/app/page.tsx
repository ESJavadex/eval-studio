"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import BenchmarkList from "@/components/BenchmarkList";
import ModelSelector from "@/components/ModelSelector";
import ResultsGrid from "@/components/ResultsGrid";
import PastResults from "@/components/PastResults";
import TabBar from "@/components/TabBar";
import Scoreboard from "@/components/Scoreboard";
import type { BenchmarkInfo, RunResult, Score, ScoringCriteria, StreamingState } from "@/lib/types";
import { extractCodePartial } from "@/lib/code-extractor";

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
  const [runLogs, setRunLogs] = useState<string[]>([]);

  const [activeTab, setActiveTab] = useState("runner");
  const [scores, setScores] = useState<Score[]>([]);
  const [criteria, setCriteria] = useState<ScoringCriteria[]>([]);
  const [promptExpanded, setPromptExpanded] = useState(true);

  // Streaming state for live token display
  const [streamingStates, setStreamingStates] = useState<Record<string, StreamingState>>({});
  const streamingRef = useRef<Record<string, StreamingState>>({});
  const throttleTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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

  // ---- SSE stream consumer for run-benchmark API ----
  const consumeRunStream = async (
    benchmarkId: string,
    modelIds: string[],
    onResult: (result: RunResult) => void,
    onLog: (msg: string) => void,
    onToken?: (modelId: string, delta: string) => void
  ) => {
    const res = await fetch("/api/run-benchmark", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ benchmarkId, modelIds }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(err);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(trimmed.slice(6));
          if (event.type === "log") onLog(event.message);
          if (event.type === "token" && onToken) onToken(event.modelId, event.delta);
          if (event.type === "result") onResult(event.result);
        } catch {
          // skip
        }
      }
    }
  };

  // ---- Token handler with 300ms throttle for HTML extraction ----
  const handleToken = (modelId: string, delta: string) => {
    // Initialize if needed
    if (!streamingRef.current[modelId]) {
      streamingRef.current[modelId] = {
        partialContent: "",
        extractedHtml: "",
        tokenCount: 0,
        startTime: Date.now(),
      };
    }

    const state = streamingRef.current[modelId];
    state.partialContent += delta;
    state.tokenCount++;

    // Throttle extractCodePartial + React state update to every 300ms
    if (!throttleTimers.current[modelId]) {
      throttleTimers.current[modelId] = setTimeout(() => {
        delete throttleTimers.current[modelId];
        const current = streamingRef.current[modelId];
        if (!current) return;
        const extracted = extractCodePartial(current.partialContent);
        current.extractedHtml = extracted;
        setStreamingStates({ ...streamingRef.current });
      }, 300);
    }
  };

  const clearStreamingState = (modelId: string) => {
    delete streamingRef.current[modelId];
    if (throttleTimers.current[modelId]) {
      clearTimeout(throttleTimers.current[modelId]);
      delete throttleTimers.current[modelId];
    }
    setStreamingStates({ ...streamingRef.current });
  };

  // ---- Run benchmark: 1 benchmark × N models (parallel, SSE streams) ----
  const runBenchmark = async () => {
    if (!selectedBenchmark || selectedModels.size === 0) return;

    setRunning(true);
    setResults([]);
    setRunLogs([]);
    streamingRef.current = {};
    setStreamingStates({});

    const modelIds = Array.from(selectedModels);
    const resultsRef: (RunResult | null)[] = modelIds.map(() => null);
    let completed = 0;

    const addLog = (msg: string) => {
      const ts = new Date().toLocaleTimeString();
      setRunLogs((prev) => [...prev, `[${ts}] ${msg}`]);
    };

    setRunProgress(
      `Running ${modelIds.length} model${modelIds.length > 1 ? "s" : ""} in parallel...`
    );

    addLog(`Starting ${modelIds.length} parallel stream(s)...`);

    await Promise.allSettled(
      modelIds.map(async (modelId, idx) => {
        try {
          await consumeRunStream(
            selectedBenchmark,
            [modelId],
            (result) => {
              clearStreamingState(modelId);
              resultsRef[idx] = result;
              completed++;
              setRunProgress(`Completed ${completed}/${modelIds.length} models...`);
              setResults(resultsRef.filter((r): r is RunResult => r !== null));
            },
            addLog,
            handleToken
          );
        } catch (err) {
          clearStreamingState(modelId);
          const errMsg = err instanceof Error ? err.message : "Network error";
          addLog(`FAILED ${modelNames[modelId] ?? modelId}: ${errMsg}`);
          resultsRef[idx] = {
            benchmarkId: selectedBenchmark,
            modelId,
            modelName: modelNames[modelId] ?? modelId,
            rawResponse: "",
            extractedCode: "",
            resultPath: "",
            durationMs: 0,
            success: false,
            error: errMsg,
          };
          completed++;
          setRunProgress(`Completed ${completed}/${modelIds.length} models...`);
          setResults(resultsRef.filter((r): r is RunResult => r !== null));
        }
      })
    );

    addLog("All models finished.");
    setResults(resultsRef.filter((r): r is RunResult => r !== null));
    setRunningModel(null);
    setRunning(false);
    setRunProgress(null);

    fetch("/api/results")
      .then((r) => r.json())
      .then(setPastResults);
  };

  // ---- Run all benchmarks for 1 model (sequential, SSE streams) ----
  const runAllBenchmarks = async () => {
    if (selectedModels.size !== 1) return;

    const modelId = Array.from(selectedModels)[0];
    setRunning(true);
    setResults([]);
    setRunLogs([]);
    streamingRef.current = {};
    setStreamingStates({});

    const totalBenchmarks = benchmarks.length;
    const allResults: RunResult[] = [];

    const addLog = (msg: string) => {
      const ts = new Date().toLocaleTimeString();
      setRunLogs((prev) => [...prev, `[${ts}] ${msg}`]);
    };

    addLog(`Starting RUN ALL: ${totalBenchmarks} benchmarks for ${modelNames[modelId] ?? modelId}`);

    for (let i = 0; i < benchmarks.length; i++) {
      const benchmark = benchmarks[i];
      setRunningModel(modelId);
      setRunProgress(
        `Benchmark ${i + 1}/${totalBenchmarks}: ${benchmark.name}`
      );
      setSelectedBenchmark(benchmark.id);

      try {
        await consumeRunStream(
          benchmark.id,
          [modelId],
          (result) => {
            clearStreamingState(modelId);
            allResults.push(result);
            setResults([...allResults]);
          },
          addLog,
          handleToken
        );
      } catch (err) {
        clearStreamingState(modelId);
        const errMsg = err instanceof Error ? err.message : "Network error";
        addLog(`FAILED ${benchmark.name}: ${errMsg}`);
        allResults.push({
          benchmarkId: benchmark.id,
          modelId,
          modelName: modelNames[modelId] ?? modelId,
          rawResponse: "",
          extractedCode: "",
          resultPath: "",
          durationMs: 0,
          success: false,
          error: errMsg,
        });
        setResults([...allResults]);
      }
    }

    addLog("All benchmarks finished.");
    setRunningModel(null);
    setRunning(false);
    setRunProgress(null);

    fetch("/api/results")
      .then((r) => r.json())
      .then(setPastResults);
  };

  // ---- TEST ALL: sequential load → run → unload for each model ----
  const testAllModels = async () => {
    if (!selectedBenchmark || selectedModels.size === 0) return;

    setRunning(true);
    setResults([]);
    setRunLogs([]);
    streamingRef.current = {};
    setStreamingStates({});

    const modelIds = Array.from(selectedModels);
    const allResults: RunResult[] = [];
    const baseUrl = "http://localhost:1234/v1";

    const addLog = (msg: string) => {
      const ts = new Date().toLocaleTimeString();
      setRunLogs((prev) => [...prev, `[${ts}] ${msg}`]);
    };

    addLog(`Starting TEST ALL: ${modelIds.length} models sequentially with load/unload`);

    for (let i = 0; i < modelIds.length; i++) {
      const modelId = modelIds[i];
      const name = modelNames[modelId] ?? modelId;

      setRunProgress(`[${i + 1}/${modelIds.length}] Unloading all models...`);
      addLog(`Unloading all models before loading ${name}...`);

      try {
        await fetch("/api/model-management", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "unload-all", baseUrl }),
        });
      } catch {
        addLog("Warning: unload-all failed, continuing anyway...");
      }

      setRunProgress(`[${i + 1}/${modelIds.length}] Loading ${name}...`);
      addLog(`Loading ${name}...`);

      try {
        const loadRes = await fetch("/api/model-management", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "load", modelId, baseUrl }),
        });
        const loadData = await loadRes.json();
        if (loadData.error) {
          addLog(`Warning: load failed for ${name}: ${loadData.error}`);
        } else {
          const loadTime = loadData.loadTime
            ? ` (${loadData.loadTime.toFixed(1)}s)`
            : "";
          addLog(`${name} loaded${loadTime}`);
        }
      } catch {
        addLog(`Warning: load request failed for ${name}, trying benchmark anyway...`);
      }

      refreshModelStates();

      setRunProgress(`[${i + 1}/${modelIds.length}] Running ${name}...`);
      setRunningModel(modelId);
      addLog(`Running benchmark for ${name}...`);

      try {
        await consumeRunStream(
          selectedBenchmark,
          [modelId],
          (result) => {
            clearStreamingState(modelId);
            allResults.push(result);
            setResults([...allResults]);
          },
          addLog,
          handleToken
        );
      } catch (err) {
        clearStreamingState(modelId);
        const errMsg = err instanceof Error ? err.message : "Network error";
        addLog(`FAILED ${name}: ${errMsg}`);
        allResults.push({
          benchmarkId: selectedBenchmark,
          modelId,
          modelName: name,
          rawResponse: "",
          extractedCode: "",
          resultPath: "",
          durationMs: 0,
          success: false,
          error: errMsg,
        });
        setResults([...allResults]);
      }
    }

    // Final cleanup: unload all
    addLog("Unloading all models (cleanup)...");
    try {
      await fetch("/api/model-management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unload-all", baseUrl }),
      });
    } catch {
      // ignore
    }

    refreshModelStates();
    addLog("TEST ALL finished.");
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
  const canTestAll = selectedModels.size >= 1 && !!selectedBenchmark;

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
                {canTestAll && (
                  <button
                    onClick={testAllModels}
                    disabled={running}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                      running
                        ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                        : "bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/20"
                    }`}
                  >
                    TEST ALL
                  </button>
                )}

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

            {/* Live Logs */}
            {runLogs.length > 0 && (
              <div className="border-b border-zinc-800/50 bg-zinc-900/30 px-6 py-2 max-h-40 overflow-y-auto">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                    Live Logs
                  </span>
                  {!running && (
                    <button
                      onClick={() => setRunLogs([])}
                      className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {runLogs.map((log, i) => (
                  <div
                    key={i}
                    className={`text-[11px] font-mono leading-relaxed ${
                      log.includes("FAILED")
                        ? "text-red-400"
                        : log.includes("completed")
                          ? "text-green-400"
                          : log.includes("generating")
                            ? "text-yellow-400/70"
                            : "text-zinc-500"
                    }`}
                  >
                    {log}
                  </div>
                ))}
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
                streamingStates={streamingStates}
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
