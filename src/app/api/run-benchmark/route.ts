import { NextRequest } from "next/server";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { getModelById } from "@/lib/models";
import { listBenchmarks, runBenchmarkStreaming } from "@/lib/benchmark-runner";
import { safeModelDir } from "@/lib/types";

// Allow up to 2 hours for long CPU inference runs (~1 tok/s on some models)
export const maxDuration = 7200;

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  // Helper to send SSE events (swallows errors if stream is dead so
  // the handler can still finish saving results to disk)
  function sendEvent(
    controller: ReadableStreamDefaultController,
    type: string,
    data: unknown
  ) {
    try {
      const payload = JSON.stringify({ type, ...( typeof data === 'object' && data !== null ? data : { message: data }) });
      controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
    } catch {
      // Stream already closed (browser disconnected / proxy timeout) — ignore
    }
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
        // Heartbeat: send a keep-alive comment every 15s to prevent
        // browser/proxy timeouts during long model loading & prefill phases
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            // stream already closed
            clearInterval(heartbeat);
          }
        }, 15_000);

        try {
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

            try {
              const gen = runBenchmarkStreaming(benchmark, model);

              // Stream token deltas to the client
              let genResult = await gen.next();
              while (!genResult.done) {
                sendEvent(controller, "token", {
                  modelId,
                  delta: genResult.value,
                });
                genResult = await gen.next();
              }

              // Generator return value has the final result
              const { rawResponse, extractedCode, durationMs } = genResult.value;

              // Save result to disk (sanitize modelId for safe directory names)
              const safeMid = safeModelDir(modelId);
              const resultDir = join(
                process.cwd(),
                "public",
                "results",
                benchmarkId,
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
                  resultPath: `/results/${benchmarkId}/${safeMid}/index.html`,
                  durationMs,
                  success: true,
                },
              });
            } catch (err) {
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
        } finally {
          clearInterval(heartbeat);
          controller.close();
        }
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
