import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build autonoma: sul VPS si avvia .next/standalone/server.js senza node_modules.
  output: "standalone",

  // Non esporre la versione di Next nelle intestazioni di risposta.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
