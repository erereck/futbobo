import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_ACTIONS === "true";
const isItchBuild = process.env.ITCH_BUILD === "true";
const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";
const basePath = isGitHubPages && !isCapacitorBuild ? "/futbobo" : "";
const assetPrefix = isGitHubPages && !isCapacitorBuild ? "/futbobo/" : isItchBuild ? "./" : "";
const publicBasePath = isGitHubPages && !isCapacitorBuild ? "/futbobo" : isItchBuild ? "." : "";

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
