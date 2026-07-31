import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root. Without this, Turbopack walks up and finds a
    // stray lockfile in the home directory and infers the wrong root.
    root: __dirname,
  },
  // better-sqlite3 is a native module; keep it out of the bundle so it loads
  // from node_modules at runtime.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
