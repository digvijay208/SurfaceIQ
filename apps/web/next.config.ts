import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

function loadRepoEnvFiles() {
  const configDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(configDir, "../../.env.local"),
    resolve(configDir, "../../.env")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
    }
  }
}

loadRepoEnvFiles();

const nextConfig: NextConfig = {
  transpilePackages: ["@surfaceiq/core"]
};

export default nextConfig;
