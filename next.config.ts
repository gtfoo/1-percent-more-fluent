import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root. Without this, Turbopack walks up and finds a
    // stray lockfile in the home directory and infers the wrong root.
    root: __dirname,
  },
  // Emits a self-contained server in .next/standalone, so the droplet only
  // needs Node rather than the full dependency tree.
  output: "standalone",
  // The tracer otherwise copies ./data into the build output - the live SQLite
  // database and the whole synthesised audio cache, 6.6MB of it and growing.
  // Nothing reads it from there (the service runs with the repo as its working
  // directory, so process.cwd()/data is the real one), so all a copy achieves
  // is shipping a stale snapshot of the user database on every deploy.
  outputFileTracingExcludes: {
    "*": ["./data/**"],
  },
  // better-sqlite3 is a native module; keep it out of the bundle so it loads
  // from node_modules at runtime. Standalone output traces the .node file in.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
