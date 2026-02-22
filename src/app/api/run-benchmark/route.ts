import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { getModelById } from "@/lib/models";
import { listBenchmarks, runBenchmark } from "@/lib/benchmark-runner";
import type { RunResult } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { benchmarkId, modelIds } = await req.json();

    if (!benchmarkId || !Array.isArray(modelIds) || modelIds.length === 0) {
      return NextResponse.json(
        { error: "benchmarkId (string) and modelIds (string[]) are required" },
        { status: 400 }
      );
    }

    const benchmarks = listBenchmarks();
    const benchmark = benchmarks.find((b) => b.id === benchmarkId);
    if (!benchmark) {
      return NextResponse.json(
        { error: `Benchmark "${benchmarkId}" not found` },
        { status: 404 }
      );
    }

    const results: RunResult[] = [];

    // Run models sequentially to avoid overwhelming local inference
    for (const modelId of modelIds) {
      const model = await getModelById(modelId);
      if (!model) {
        results.push({
          benchmarkId,
          modelId,
          modelName: modelId,
          rawResponse: "",
          extractedCode: "",
          resultPath: "",
          durationMs: 0,
          success: false,
          error: `Model "${modelId}" not found in config`,
        });
        continue;
      }

      try {
        const { rawResponse, extractedCode, durationMs } = await runBenchmark(
          benchmark,
          model
        );

        // Save result to public/results/[benchmark-id]/[model-id]/index.html
        const resultDir = join(
          process.cwd(),
          "public",
          "results",
          benchmarkId,
          modelId
        );
        if (!existsSync(resultDir)) {
          mkdirSync(resultDir, { recursive: true });
        }

        const resultFile = join(resultDir, "index.html");
        writeFileSync(resultFile, extractedCode, "utf-8");

        // Also save raw response for debugging
        writeFileSync(
          join(resultDir, "raw-response.txt"),
          rawResponse,
          "utf-8"
        );

        const resultPath = `/results/${benchmarkId}/${modelId}/index.html`;
        results.push({
          benchmarkId,
          modelId,
          modelName: model.name,
          rawResponse,
          extractedCode,
          resultPath,
          durationMs,
          success: true,
        });
      } catch (err) {
        results.push({
          benchmarkId,
          modelId,
          modelName: model.name,
          rawResponse: "",
          extractedCode: "",
          resultPath: "",
          durationMs: 0,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
