/**
 * LM Studio native API client for model management.
 * Uses /api/v1/ endpoints (not the OpenAI-compatible /v1/).
 */

export interface LMStudioModel {
  key: string;
  display_name: string;
  type: string;
  architecture: string;
  params_string: string;
  size_bytes: number;
  quantization: { name: string; bits_per_weight: number };
  loaded_instances: { id: string; remaining_ttl_seconds: number }[];
  max_context_length: number;
}

/** Derive the LM Studio host from an OpenAI-compat baseUrl */
function getHost(baseUrl: string): string {
  // baseUrl is like "http://localhost:1234/v1" — strip the path
  const u = new URL(baseUrl);
  return u.origin;
}

/** Get all models with their loaded state from LM Studio */
export async function getModelStates(
  baseUrl: string
): Promise<LMStudioModel[]> {
  const host = getHost(baseUrl);
  try {
    const res = await fetch(`${host}/api/v1/models`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.models ?? [];
  } catch {
    return [];
  }
}

/** Load a model into memory */
export async function loadModel(
  baseUrl: string,
  modelId: string
): Promise<{ success: boolean; error?: string; loadTime?: number }> {
  const host = getHost(baseUrl);
  try {
    const res = await fetch(`${host}/api/v1/models/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelId }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: text };
    }
    const data = await res.json();
    return { success: true, loadTime: data.load_time_seconds };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Unload a specific model from memory */
export async function unloadModel(
  baseUrl: string,
  instanceId: string
): Promise<{ success: boolean; error?: string }> {
  const host = getHost(baseUrl);
  try {
    const res = await fetch(`${host}/api/v1/models/unload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instance_id: instanceId }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: text };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Unload ALL currently loaded models */
export async function unloadAllModels(
  baseUrl: string
): Promise<{ unloaded: string[]; errors: string[] }> {
  const models = await getModelStates(baseUrl);
  const loaded = models.filter((m) => m.loaded_instances.length > 0);

  const unloaded: string[] = [];
  const errors: string[] = [];

  await Promise.all(
    loaded.flatMap((m) =>
      m.loaded_instances.map(async (inst) => {
        const result = await unloadModel(baseUrl, inst.id);
        if (result.success) {
          unloaded.push(inst.id);
        } else {
          errors.push(`${inst.id}: ${result.error}`);
        }
      })
    )
  );

  return { unloaded, errors };
}
