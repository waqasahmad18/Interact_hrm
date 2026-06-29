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
  async headers() {
    return [
      {
        // Face-api model weights are static and content-stable. Cache them hard
        // so they are downloaded only once — reopening a tab or reloading the
        // app then loads the camera/engine from cache instead of re-fetching
        // several megabytes (SSD + landmark + recognition models).
        source: "/models/face-api/:file*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
  poweredByHeader: false,
};

export default nextConfig;
