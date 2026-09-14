import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/*": ["./Atlas_Fresh_Production_Commercial_Data.xlsx"],
  },
  poweredByHeader: false,
};

export default nextConfig;
