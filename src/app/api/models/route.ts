import { NextResponse } from "next/server";
import { getModels } from "@/lib/models";

export async function GET() {
  const allModels = await getModels();
  // Return models without exposing API keys
  const models = allModels.map(({ apiKey, ...rest }) => ({
    ...rest,
    hasApiKey: !!apiKey && apiKey !== "not-needed",
  }));
  return NextResponse.json(models);
}
