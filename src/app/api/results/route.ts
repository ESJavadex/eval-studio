import { NextResponse } from "next/server";
import { readdirSync, existsSync } from "fs";
import { join } from "path";

export async function GET() {
  const resultsDir = join(process.cwd(), "public", "results");
  if (!existsSync(resultsDir)) {
    return NextResponse.json({});
  }

  const results: Record<string, string[]> = {};
  const benchmarkDirs = readdirSync(resultsDir, { withFileTypes: true });

  for (const bDir of benchmarkDirs) {
    if (!bDir.isDirectory()) continue;
    const modelDirs = readdirSync(join(resultsDir, bDir.name), {
      withFileTypes: true,
    });
    results[bDir.name] = modelDirs
      .filter(
        (m) =>
          m.isDirectory() &&
          existsSync(join(resultsDir, bDir.name, m.name, "index.html"))
      )
      .map((m) => m.name);
  }

  return NextResponse.json(results);
}
