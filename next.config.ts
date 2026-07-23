import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_ACTIONS === "true";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: isGitHubPages ? "/futbobo" : "",
  assetPrefix: isGitHubPages ? "/futbobo/" : "",
  env: { NEXT_PUBLIC_BASE_PATH: isGitHubPages ? "/futbobo" : "" },
  turbopack: { root: process.cwd() },
};

export default nextConfig;
