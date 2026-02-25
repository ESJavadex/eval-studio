import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { getModelById } from "@/lib/models";
import { listBenchmarks, runBenchmark } from "@/lib/benchmark-runner";
import { safeModelDir } from "@/lib/types";
import type { RunResult } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { modelId } = await req.json();

    if (!modelId) {
      return NextResponse.json(
        { error: "modelId is required" },
        { status: 400 }
      );
    }

    const model = await getModelById(modelId);
    if (!model) {
      return NextResponse.json(
        { error: `Model "${modelId}" not found in config` },
        { status: 404 }
      );
    }

    const benchmarks = listBenchmarks();
    const results: RunResult[] = [];

    const safeMid = safeModelDir(modelId);

    for (const benchmark of benchmarks) {
      try {
        const { rawResponse, extractedCode, durationMs } = await runBenchmark(
          benchmark,
          model
        );

        const resultDir = join(
          process.cwd(),
          "public",
          "results",
          benchmark.id,
          safeMid
        );
        if (!existsSync(resultDir)) {
          mkdirSync(resultDir, { recursive: true });
        }

        writeFileSync(join(resultDir, "index.html"), extractedCode, "utf-8");
        writeFileSync(
          join(resultDir, "raw-response.txt"),
          rawResponse,
          "utf-8"
        );

        results.push({
          benchmarkId: benchmark.id,
          modelId,
          modelName: model.name,
          rawResponse,
          extractedCode,
          resultPath: `/results/${benchmark.id}/${safeMid}/index.html`,
          durationMs,
          success: true,
        });
      } catch (err) {
        results.push({
          benchmarkId: benchmark.id,
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
