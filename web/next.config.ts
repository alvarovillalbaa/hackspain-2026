import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  // Playwright hits 127.0.0.1; without this Next 16 blocks HMR/dev assets.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

// Mounts the eve agent in ./agent at /eve/v1/* — one dev server, one deploy.
export default withEve(nextConfig);
