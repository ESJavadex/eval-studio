"use client";

import { useState, useEffect } from "react";
import type { Score, ScoringCriteria } from "@/lib/types";

interface Props {
  benchmarkId: string;
  modelId: string;
  existingScores: Score[];
  criteria: ScoringCriteria[];
  onScoreSaved: (score: Score) => void;
}

export default function ScorePanel({
  benchmarkId,
  modelId,
  existingScores,
  criteria,
  onScoreSaved,
}: Props) {
  const existing = existingScores.find(
    (s) => s.benchmarkId === benchmarkId && s.modelId === modelId
  );

  const [scores, setScores] = useState<Record<string, number>>(() => {
    if (existing) return { ...existing.scores };
    const defaults: Record<string, number> = {};
    for (const c of criteria) defaults[c.id] = 5;
    return defaults;
  });
  const [notes, setNotes] = useState(existing?.notes || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Reset when benchmark/model changes
  useEffect(() => {
    const ex = existingScores.find(
      (s) => s.benchmarkId === benchmarkId && s.modelId === modelId
    );
    if (ex) {
      setScores({ ...ex.scores });
      setNotes(ex.notes);
    } else {
      const defaults: Record<string, number> = {};
      for (const c of criteria) defaults[c.id] = 5;
      setScores(defaults);
      setNotes("");
    }
    setSaved(false);
  }, [benchmarkId, modelId, existingScores, criteria]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          benchmarkId,
          modelId,
          scores,
          notes,
          scoredBy: "manual",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onScoreSaved(data);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  const avg =
    criteria.length > 0
      ? criteria.reduce((sum, c) => sum + (scores[c.id] || 0), 0) /
        criteria.length
      : 0;

  return (
    <div className="border-t border-zinc-700 bg-zinc-800/50 px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-zinc-400">Score</span>
        <span
          className={`text-xs font-bold px-2 py-0.5 rounded ${
            avg >= 7
              ? "bg-green-900/50 text-green-400"
              : avg >= 4
                ? "bg-yellow-900/50 text-yellow-400"
                : "bg-red-900/50 text-red-400"
          }`}
        >
          {avg.toFixed(1)}/10
        </span>
      </div>

      <div className="space-y-1.5">
        {criteria.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <label
              className="text-[11px] text-zinc-500 w-20 shrink-0 truncate"
              title={c.description}
            >
              {c.name}
            </label>
            <input
              type="range"
              min={c.min}
              max={c.max}
              value={scores[c.id] || 0}
              onChange={(e) =>
                setScores((prev) => ({
                  ...prev,
                  [c.id]: Number(e.target.value),
                }))
              }
              className="flex-1 h-1 accent-blue-500"
            />
            <span className="text-[11px] text-zinc-400 w-5 text-right">
              {scores[c.id] || 0}
            </span>
          </div>
        ))}
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes..."
        rows={1}
        className="w-full mt-2 px-2 py-1 text-[11px] bg-zinc-900 border border-zinc-700 rounded text-zinc-300 placeholder-zinc-600 resize-none focus:outline-none focus:border-zinc-500"
      />

      <button
        onClick={handleSave}
        disabled={saving}
        className={`mt-1.5 w-full py-1 rounded text-[11px] font-medium transition-colors ${
          saved
            ? "bg-green-800 text-green-200"
            : saving
              ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-500 text-white"
        }`}
      >
        {saved ? "Saved!" : saving ? "Saving..." : "Save Score"}
      </button>
    </div>
  );
}
