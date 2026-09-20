import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The seed JSON files are only read at runtime in demo mode (Supabase not configured); make sure they
  // still ship with the server bundle so a deploy without Supabase variables keeps working.
  outputFileTracingIncludes: {
    "/**": ["./data/projects/**/*.json"],
  },
};

export default nextConfig;
