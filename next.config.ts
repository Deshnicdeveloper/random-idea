import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Bible text is read from disk at runtime; make sure it ships with the API routes.
  outputFileTracingIncludes: { "/api/**": ["./data/bible.json"] },
  // Hide the floating dev badge (build errors still show as an overlay).
  devIndicators: false,
};

export default nextConfig;
