import type { NextConfig } from "next";
import withPWA from "next-pwa";

type UrlPatternArgs = { url: URL };
type RequestPatternArgs = { request: Request };

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.sureimports.com",
        pathname: "/images/**",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/djprcwnsz/image/upload/**",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/machines",
        destination: "/machine-sourcing-webinar",
        permanent: true,
      },
      {
        source: "/machines/:path*",
        destination: "/machine-sourcing-webinar",
        permanent: true,
      },
      {
        source: "/machine-sourcing",
        destination: "/",
        permanent: true,
      },
      {
        source: "/supplier-intelligence/:path*",
        destination: "https://www.sureimports.com/supplier-intelligence/:path*",
        permanent: false,
      },
      {
        source: "/book-consultation",
        destination: "https://www.sureimports.com/book-consultation",
        permanent: false,
      },
      {
        source: "/buy-from-chinese-websites",
        destination: "https://www.sureimports.com/buy-from-chinese-websites",
        permanent: false,
      },
      {
        source: "/ship-with-us",
        destination: "https://www.sureimports.com/ship-with-us",
        permanent: false,
      },
      {
        source: "/corporate-sourcing",
        destination: "https://www.sureimports.com/corporate-sourcing",
        permanent: false,
      },
      {
        source: "/laptops-for-business",
        destination: "https://www.sureimports.com/laptops-for-business",
        permanent: false,
      },
      {
        source: "/tools/:path*",
        destination: "https://www.sureimports.com/tools/:path*",
        permanent: false,
      },
      {
        source: "/import-from-china-to-nigeria",
        destination: "https://www.sureimports.com/import-from-china-to-nigeria",
        permanent: false,
      },
      {
        source: "/blog/:path*",
        destination: "https://www.sureimports.com/blog/:path*",
        permanent: false,
      },
      {
        source: "/shop/:path*",
        destination: "https://www.sureimports.com/shop/:path*",
        permanent: false,
      },
      {
        source: "/shop",
        destination: "https://www.sureimports.com/shop",
        permanent: false,
      },
      {
        source: "/auth/login",
        destination: "https://www.sureimports.com/auth/login",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/images/svg-logo.svg",
        destination: "https://www.sureimports.com/images/svg-logo.svg",
      },
      {
        source: "/images/svg-logo-white.svg",
        destination: "https://www.sureimports.com/images/svg-logo-white.svg",
      },
    ];
  },
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
