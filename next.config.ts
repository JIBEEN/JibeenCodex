import type { NextConfig } from "next";
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
const inferred =
  process.env.GITHUB_ACTIONS === "true" && repo && !repo.endsWith(".github.io")
    ? `/${repo}`
    : "";
const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH === "/"
    ? ""
    : process.env.NEXT_PUBLIC_BASE_PATH || inferred;
const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};
export default config;
