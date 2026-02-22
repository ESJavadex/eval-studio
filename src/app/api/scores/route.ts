import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { Score } from "@/lib/types";

const SCORES_PATH = join(process.cwd(), "public", "results", "scores.json");

function loadScores(): Score[] {
  if (!existsSync(SCORES_PATH)) return [];
  try {
    return JSON.parse(readFileSync(SCORES_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveScores(scores: Score[]) {
  const dir = join(process.cwd(), "public", "results");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(SCORES_PATH, JSON.stringify(scores, null, 2), "utf-8");
}

export async function GET() {
  return NextResponse.json(loadScores());
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { benchmarkId, modelId, scores, notes, scoredBy } = body;

    if (!benchmarkId || !modelId || !scores) {
      return NextResponse.json(
        { error: "benchmarkId, modelId, and scores are required" },
        { status: 400 }
      );
    }

    const allScores = loadScores();

    // Replace existing score for same benchmark+model+scorer, or add new
    const idx = allScores.findIndex(
      (s) =>
        s.benchmarkId === benchmarkId &&
        s.modelId === modelId &&
        s.scoredBy === (scoredBy || "manual")
    );

    const newScore: Score = {
      benchmarkId,
      modelId,
      scores,
      notes: notes || "",
      scoredBy: scoredBy || "manual",
      timestamp: Date.now(),
    };

    if (idx >= 0) {
      allScores[idx] = newScore;
    } else {
      allScores.push(newScore);
    }

    saveScores(allScores);
    return NextResponse.json(newScore);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
