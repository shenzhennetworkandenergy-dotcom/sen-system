import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.VERCEL === "1" ? undefined : "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "52mb",
    },
  },
};

export default nextConfig;
