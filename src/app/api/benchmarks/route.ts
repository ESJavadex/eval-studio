import { NextResponse } from "next/server";
import { listBenchmarks } from "@/lib/benchmark-runner";

export async function GET() {
  const benchmarks = listBenchmarks();
  return NextResponse.json(benchmarks);
}
