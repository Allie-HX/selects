import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@remotion/bundler", "@remotion/renderer"],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
