import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** face-api / tfjs are browser-only; avoid server bundle resolution issues on Linux CI. */
  serverExternalPackages: ["@tensorflow/tfjs", "@vladmandic/face-api"],
  async redirects() {
    return [
      {
        source: "/",
        destination: "/auth",
        permanent: true,
      },
    ];
  },
  poweredByHeader: false,
};

export default nextConfig;
