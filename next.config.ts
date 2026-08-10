import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_ACTIONS === "true";
const hasCustomDomain = process.env.GITHUB_PAGES_CUSTOM_DOMAIN === "true";
const isItchBuild = process.env.ITCH_BUILD === "true";
const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";
const usesRepositoryPath = isGitHubPages && !isCapacitorBuild && !hasCustomDomain;
const basePath = usesRepositoryPath ? "/futbobo" : "";
const assetPrefix = usesRepositoryPath ? "/futbobo/" : isItchBuild ? "./" : "";
const publicBasePath = usesRepositoryPath ? "/futbobo" : isItchBuild ? "." : "";

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
