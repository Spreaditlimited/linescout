import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/white-label/wizard",
          "/api",
          "/internal"
        ],
      },
    ],
    sitemap: "https://linescout.sureimports.com/sitemap.xml",
  };
}