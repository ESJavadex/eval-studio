import { NextRequest } from "next/server";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { getModelById } from "@/lib/models";
import { listBenchmarks, runBenchmark } from "@/lib/benchmark-runner";

// Allow up to 20 minutes for long inference runs
export const maxDuration = 1200;

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  // Helper to send SSE events
  function sendEvent(
    controller: ReadableStreamDefaultController,
    type: string,
    data: unknown
  ) {
    const payload = JSON.stringify({ type, ...( typeof data === 'object' && data !== null ? data : { message: data }) });
    controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
  }

  try {
    const { benchmarkId, modelIds } = await req.json();

    if (!benchmarkId || !Array.isArray(modelIds) || modelIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "benchmarkId and modelIds[] required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const benchmarks = listBenchmarks();
    const benchmark = benchmarks.find((b) => b.id === benchmarkId);
    if (!benchmark) {
      return new Response(
        JSON.stringify({ error: `Benchmark "${benchmarkId}" not found` }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        sendEvent(controller, "log", {
          message: `Starting benchmark "${benchmarkId}" for ${modelIds.length} model(s)`,
        });

        for (const modelId of modelIds) {
          const model = await getModelById(modelId);
          if (!model) {
            sendEvent(controller, "log", {
              message: `Model "${modelId}" not found — skipping`,
            });
            sendEvent(controller, "result", {
              result: {
                benchmarkId,
                modelId,
                modelName: modelId,
                rawResponse: "",
                extractedCode: "",
                resultPath: "",
                durationMs: 0,
                success: false,
                error: `Model "${modelId}" not found in config`,
              },
            });
            continue;
          }

          sendEvent(controller, "log", {
            message: `Calling ${model.name}... (streaming tokens)`,
          });

          const startTime = Date.now();

          // Send heartbeat every 30s to keep connection alive
          const heartbeat = setInterval(() => {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            sendEvent(controller, "log", {
              message: `${model.name}: generating... (${elapsed}s elapsed)`,
            });
          }, 30_000);

          try {
            const { rawResponse, extractedCode, durationMs } =
              await runBenchmark(benchmark, model);

            clearInterval(heartbeat);

            // Save result to disk
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
            writeFileSync(join(resultDir, "index.html"), extractedCode, "utf-8");
            writeFileSync(
              join(resultDir, "raw-response.txt"),
              rawResponse,
              "utf-8"
            );

            const secs = (durationMs / 1000).toFixed(1);
            sendEvent(controller, "log", {
              message: `${model.name} completed in ${secs}s (${rawResponse.length} chars)`,
            });

            sendEvent(controller, "result", {
              result: {
                benchmarkId,
                modelId,
                modelName: model.name,
                rawResponse,
                extractedCode,
                resultPath: `/results/${benchmarkId}/${modelId}/index.html`,
                durationMs,
                success: true,
              },
            });
          } catch (err) {
            clearInterval(heartbeat);
            const errMsg = err instanceof Error ? err.message : String(err);
            sendEvent(controller, "log", {
              message: `${model.name} FAILED: ${errMsg}`,
            });
            sendEvent(controller, "result", {
              result: {
                benchmarkId,
                modelId,
                modelName: model.name,
                rawResponse: "",
                extractedCode: "",
                resultPath: "",
                durationMs: 0,
                success: false,
                error: errMsg,
              },
            });
          }
        }

        sendEvent(controller, "done", { message: "All models finished" });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
