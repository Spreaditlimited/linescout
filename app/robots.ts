import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/machine-sourcing",
          "/white-label/wizard",
          "/api",
          "/internal",
          "/agent-app",
          "/agents",
        ],
      },
    ],
    sitemap: "https://linescout.sureimports.com/sitemap.xml",
  };
}
