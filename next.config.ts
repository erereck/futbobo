import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_ACTIONS === "true";
const isItchBuild = process.env.ITCH_BUILD === "true";
const basePath = isGitHubPages ? "/futbobo" : "";
const assetPrefix = isGitHubPages ? "/futbobo/" : isItchBuild ? "./" : "";
const publicBasePath = isGitHubPages ? "/futbobo" : isItchBuild ? "." : "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath,
  assetPrefix,
  env: { NEXT_PUBLIC_BASE_PATH: publicBasePath },
  turbopack: { root: process.cwd() },
};

export default nextConfig;
