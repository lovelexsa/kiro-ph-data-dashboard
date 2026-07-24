import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for Vercel — no server functions needed
  output: "export",

  // Empty turbopack config to acknowledge we're using Turbopack (Next.js 16 default)
  turbopack: {},
};

export default nextConfig;
