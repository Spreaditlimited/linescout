import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

const BASE_URL = "https://linescout.sureimports.com";

type SitemapProductRow = {
  product_name: string;
  slug: string | null;
  updated_at: Date | string | null;
  seo_updated_at: Date | string | null;
};

function slugify(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const currentDate = new Date();
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/`,
      lastModified: currentDate,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/white-label`,
      lastModified: currentDate,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/white-label-leads`,
      lastModified: currentDate,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/machine-sourcing-webinar`,
      lastModified: currentDate,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];

  try {
    const [rows] = await db.query(
      `
        SELECT p.product_name, p.slug, p.updated_at,
               MAX(CASE WHEN revision.status = 'published' THEN revision.updated_at END) AS seo_updated_at
        FROM linescout_white_label_products p
        LEFT JOIN linescout_white_label_seo_revisions revision ON revision.product_id = p.id
        WHERE p.is_active = 1
        GROUP BY p.id, p.product_name, p.slug, p.updated_at
        ORDER BY p.id ASC
      `,
    );

    const seen = new Set<string>();
    const productPages = (rows as SitemapProductRow[]).flatMap((product) => {
      const slug = product.slug || slugify(product.product_name);
      if (!slug || seen.has(slug)) return [];
      seen.add(slug);

      return [
        {
          url: `${BASE_URL}/white-label/${slug}`,
          lastModified: product.seo_updated_at || product.updated_at
            ? new Date(product.seo_updated_at || product.updated_at || currentDate)
            : currentDate,
          changeFrequency: "monthly" as const,
          priority: 0.7,
        },
      ];
    });

    return [...staticPages, ...productPages];
  } catch (error) {
    console.error("Could not build the white-label product sitemap", error);
    return staticPages;
  }
}
