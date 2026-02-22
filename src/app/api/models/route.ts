import { NextResponse } from "next/server";
import { getModels } from "@/lib/models";

export async function GET() {
  // Return models without exposing API keys
  const models = getModels().map(({ apiKey, ...rest }) => ({
    ...rest,
    hasApiKey: !!apiKey && apiKey !== "not-needed",
  }));
  return NextResponse.json(models);
}
