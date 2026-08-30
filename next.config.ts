import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security/headers";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "3000",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "3001",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "3000",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "3001",
      },

      ...(process.env.NEXT_PUBLIC_MEDIA_HOSTS ?? "")
        .split(",")
        .map((host) => host.trim())
        .filter(Boolean)
        .map((hostname) => ({
          protocol: "https" as const,
          hostname,
        })),
    ],

    formats: ["image/avif", "image/webp"],
  },

  experimental: {
    optimizePackageImports: ["lucide-react"],

    /*
     * The upload request passes through the Next.js
     * Middleware/Proxy layer before reaching the API route.
     *
     * The default client body limit is 10MB, which is too small
     * for the admin video uploader.
     */
    middlewareClientMaxBodySize: "2gb",

    serverActions: {
      allowedOrigins: [
        ...(process.env.NEXT_PUBLIC_SITE_URL
          ? [new URL(process.env.NEXT_PUBLIC_SITE_URL).host]
          : []),

        ...(process.env.AUTH_URL
          ? [new URL(process.env.AUTH_URL).host]
          : []),
      ],

      /*
       * Keep Server Actions large enough for the admin upload flow.
       */
      bodySizeLimit: "2gb",
    },
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(),
      },

      {
        source: "/media/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },

      {
        source:
          "/:file(og-default.png|icon.png|apple-icon.png|favicon.ico)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default config;