"use client";

import type { BenchmarkInfo } from "@/lib/types";

interface Props {
  benchmarks: BenchmarkInfo[];
  selected: string | null;
  onSelect: (id: string) => void;
}

export default function BenchmarkList({
  benchmarks,
  selected,
  onSelect,
}: Props) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2 px-2">
        Benchmarks
      </h2>
      {benchmarks.length === 0 && (
        <p className="text-zinc-500 text-sm px-2">No benchmarks found</p>
      )}
      {benchmarks.map((b) => (
        <button
          key={b.id}
          onClick={() => onSelect(b.id)}
          className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
            selected === b.id
              ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
              : "text-zinc-300 hover:bg-zinc-800 border border-transparent"
          }`}
        >
          <span className="font-medium">{b.name}</span>
        </button>
      ))}
    </div>
  );
}
