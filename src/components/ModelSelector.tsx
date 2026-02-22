"use client";

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

interface Props {
  models: ModelInfo[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  modelStates: Record<string, ModelState>;
  loadingModels: Set<string>;
  onLoadModel: (id: string) => void;
  onUnloadModel: (id: string) => void;
  onUnloadAll: () => void;
}

export default function ModelSelector({
  models,
  selected,
  onToggle,
  modelStates,
  loadingModels,
  onLoadModel,
  onUnloadModel,
  onUnloadAll,
}: Props) {
  const loadedCount = Object.values(modelStates).filter(
    (s) => s.loaded
  ).length;

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Models
        </span>
        {loadedCount > 0 && (
          <button
            onClick={onUnloadAll}
            className="text-[10px] px-2 py-0.5 rounded bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors"
          >
            Unload All ({loadedCount})
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {models.map((m) => {
          const isChecked = selected.has(m.id);
          const state = modelStates[m.id];
          const isLoaded = state?.loaded ?? false;
          const isLoading = loadingModels.has(m.id);
          const badge = m.source || (m.baseUrl.includes("localhost") ? "LOCAL" : null);

          return (
            <div
              key={m.id}
              className={`flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg text-sm transition-colors border ${
                isChecked
                  ? "bg-emerald-600/15 border-emerald-500/30 text-emerald-400"
                  : "bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              {/* Loaded indicator dot */}
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  isLoaded
                    ? "bg-green-400 shadow-[0_0_4px_rgba(74,222,128,0.5)]"
                    : "bg-zinc-600"
                }`}
                title={isLoaded ? "Loaded in memory" : "Not loaded"}
              />

              {/* Checkbox + name (click to select for benchmark) */}
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggle(m.id)}
                  className="sr-only"
                />
                <span
                  className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${
                    isChecked
                      ? "bg-emerald-500 border-emerald-500"
                      : "border-zinc-500"
                  }`}
                >
                  {isChecked && (
                    <svg className="w-2 h-2 text-white" viewBox="0 0 12 12">
                      <path
                        d="M10 3L4.5 8.5 2 6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span className="truncate max-w-[200px]" title={m.name}>
                  {m.name}
                </span>
              </label>

              {/* Info badges */}
              {state?.params && (
                <span className="text-[9px] text-zinc-500 shrink-0">
                  {state.params}
                </span>
              )}
              {badge && (
                <span className="text-[10px] bg-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded shrink-0">
                  {badge}
                </span>
              )}

              {/* Load/Unload button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (isLoading) return;
                  if (isLoaded) {
                    onUnloadModel(m.id);
                  } else {
                    onLoadModel(m.id);
                  }
                }}
                disabled={isLoading}
                className={`shrink-0 w-6 h-6 rounded flex items-center justify-center transition-colors ${
                  isLoading
                    ? "text-zinc-500 cursor-wait"
                    : isLoaded
                      ? "text-red-400 hover:bg-red-900/30"
                      : "text-blue-400 hover:bg-blue-900/30"
                }`}
                title={
                  isLoading
                    ? "Loading..."
                    : isLoaded
                      ? "Unload from memory"
                      : "Load into memory"
                }
              >
                {isLoading ? (
                  <svg
                    className="w-3 h-3 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                ) : isLoaded ? (
                  <svg
                    className="w-3 h-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                ) : (
                  <svg
                    className="w-3 h-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
