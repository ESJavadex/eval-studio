import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase server timeout for long-running CPU inference (2 hours)
  // Some models (e.g. Qwen3.5 27B) run at ~1 tok/s on CPU and need 60+ minutes
  experimental: {
    proxyTimeout: 7_200_000,
  },
  serverExternalPackages: [],
};

export default nextConfig;
