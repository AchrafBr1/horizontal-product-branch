/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // Load *.hpb files as plain strings (server and client bundles).
  // `next dev --turbo` (Turbopack) ignores the webpack rule below and uses this one instead.
  // On Next 15.3 and later the key is the top-level `turbopack: { rules }`.
  experimental: {
    turbo: { rules: { "*.hpb": { loaders: ["raw-loader"], as: "*.js" } } },
  },
  webpack(config) {
    config.module.rules.push({ test: /\.hpb$/, type: "asset/source" });
    return config;
  },
};

export default nextConfig;
