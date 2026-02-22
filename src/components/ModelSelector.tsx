"use client";

interface ModelInfo {
  id: string;
  name: string;
  baseUrl: string;
  hasApiKey: boolean;
  defaultModel: string;
  source?: string;
}

interface Props {
  models: ModelInfo[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}

export default function ModelSelector({ models, selected, onToggle }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
        Models
      </span>
      {models.map((m) => {
        const isChecked = selected.has(m.id);
        const badge = m.source || (m.baseUrl.includes("localhost") ? "LOCAL" : null);
        return (
          <label
            key={m.id}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors border ${
              isChecked
                ? "bg-emerald-600/15 border-emerald-500/30 text-emerald-400"
                : "bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600"
            }`}
          >
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => onToggle(m.id)}
              className="sr-only"
            />
            <span
              className={`w-3 h-3 rounded-sm border flex items-center justify-center ${
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
            <span>{m.name}</span>
            {badge && (
              <span className="text-[10px] bg-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded">
                {badge}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
