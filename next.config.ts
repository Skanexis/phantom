import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build autonoma: sul VPS si avvia .next/standalone/server.js senza node_modules.
  output: "standalone",

  // Non esporre la versione di Next nelle intestazioni di risposta.
  poweredByHeader: false,

  // Riduce la superficie esposta: le risposte non includono la versione.
  compress: true,

  async headers() {
    /**
     * Content-Security-Policy. Serve 'unsafe-inline' per gli script perché
     * Next.js inietta il payload di idratazione inline e il tema viene
     * applicato prima del primo paint; una nonce richiederebbe di rendere
     * dinamiche tutte le pagine, perdendo la prerenderizzazione statica.
     * Il resto è chiuso: nessun frame esterno, nessun plugin, form solo
     * verso l'origine.
     */
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://telegram.org",
      "style-src 'self' 'unsafe-inline'",
      // Le foto profilo Telegram arrivano da t.me e dai CDN del servizio:
      // senza questi host il browser blocca l'immagine in silenzio e resta
      // solo il ripiego con le iniziali.
      "img-src 'self' data: blob: https://t.me https://*.telegram-cdn.org https://*.cdn.telegram.org",
      "font-src 'self' data:",
      "connect-src 'self' https://telegram.org",
      "frame-ancestors 'self' https://web.telegram.org https://telegram.org",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          { key: "Content-Security-Policy", value: csp },
          // Isola la finestra da eventuali opener esterni.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
      {
        // Gli asset hanno un hash nel nome: non cambiano mai a parità di URL.
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
