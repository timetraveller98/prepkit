import { resolve } from "node:path";
import type { NextConfig } from "next";

loadRepositoryEnv();

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["@prepkit/core"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

function loadRepositoryEnv() {
  try {
    process.loadEnvFile(resolve(process.cwd(), "../../.env"));
  } catch {
    return;
  }
}

export default nextConfig;
