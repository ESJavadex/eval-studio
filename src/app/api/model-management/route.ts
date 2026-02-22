import { NextRequest, NextResponse } from "next/server";
import {
  getModelStates,
  loadModel,
  unloadModel,
  unloadAllModels,
} from "@/lib/lmstudio";

/** GET — return loaded states for all models across providers */
export async function GET(req: NextRequest) {
  const baseUrl = req.nextUrl.searchParams.get("baseUrl");
  if (!baseUrl) {
    return NextResponse.json(
      { error: "baseUrl query param required" },
      { status: 400 }
    );
  }

  const models = await getModelStates(baseUrl);

  // Build a map: modelId -> { loaded, displayName, params, quantization }
  const states: Record<
    string,
    {
      loaded: boolean;
      instanceId: string | null;
      displayName: string;
      params: string;
      quantization: string;
      sizeMb: number;
    }
  > = {};

  for (const m of models) {
    const loaded = m.loaded_instances.length > 0;
    states[m.key] = {
      loaded,
      instanceId: loaded ? m.loaded_instances[0].id : null,
      displayName: m.display_name,
      params: m.params_string,
      quantization: m.quantization?.name ?? "",
      sizeMb: Math.round(m.size_bytes / 1024 / 1024),
    };
  }

  return NextResponse.json(states);
}

/** POST — load, unload, or unload-all */
export async function POST(req: NextRequest) {
  try {
    const { action, modelId, baseUrl } = await req.json();

    if (!baseUrl) {
      return NextResponse.json(
        { error: "baseUrl is required" },
        { status: 400 }
      );
    }

    switch (action) {
      case "load": {
        if (!modelId)
          return NextResponse.json(
            { error: "modelId required for load" },
            { status: 400 }
          );
        const result = await loadModel(baseUrl, modelId);
        return NextResponse.json(result);
      }
      case "unload": {
        if (!modelId)
          return NextResponse.json(
            { error: "modelId required for unload" },
            { status: 400 }
          );
        const result = await unloadModel(baseUrl, modelId);
        return NextResponse.json(result);
      }
      case "unload-all": {
        const result = await unloadAllModels(baseUrl);
        return NextResponse.json(result);
      }
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
