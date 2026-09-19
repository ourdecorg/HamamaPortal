import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Project data lives in JSON files read at runtime; make sure they ship with server bundles.
  outputFileTracingIncludes: {
    "/**": ["./data/projects/**/*.json"],
  },
};

export default nextConfig;
