import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase server timeout for long-running CPU inference (20 minutes)
  experimental: {
    proxyTimeout: 1_200_000,
  },
  serverExternalPackages: [],
};

export default nextConfig;
