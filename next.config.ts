import type { NextConfig } from "next";
import withPWA from "next-pwa";

type UrlPatternArgs = { url: URL };
type RequestPatternArgs = { request: Request };

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",

  runtimeCaching: [
    // Never cache Next.js API routes
    {
      urlPattern: ({ url }: UrlPatternArgs) => url.pathname.startsWith("/api/"),
      handler: "NetworkOnly",
      method: "GET",
    },

    // Never cache anything with "webhook" in the path (safety)
    {
      urlPattern: ({ url }: UrlPatternArgs) => url.pathname.includes("webhook"),
      handler: "NetworkOnly",
      method: "GET",
    },

    // Cache images
    {
      urlPattern: ({ request }: RequestPatternArgs) =>
        request.destination === "image",
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "images",
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },

    // Cache static JS/CSS
    {
      urlPattern: ({ request }: RequestPatternArgs) =>
        request.destination === "script" || request.destination === "style",
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "static-resources",
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },

    // Pages: network first
    {
      urlPattern: ({ url }: UrlPatternArgs) => url.origin === self.location.origin,
      handler: "NetworkFirst",
      options: {
        cacheName: "pages",
        networkTimeoutSeconds: 10,
        expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
      },
    },
  ],
})(nextConfig);