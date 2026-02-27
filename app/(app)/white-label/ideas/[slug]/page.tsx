import type { Metadata } from "next";
import { db } from "@/lib/db";
import { ensureWhiteLabelProductsReady } from "@/lib/white-label-products";
import WhiteLabelIdeaDetailClient from "@/components/white-label/WhiteLabelIdeaDetailClient";

export const runtime = "nodejs";
export const revalidate = 3600;

type ProductRow = {
  id: number;
  product_name: string;
  short_desc: string | null;
  why_sells: string | null;
  image_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
};

function fallbackSeoDescription(product: ProductRow) {
  return (
    product.seo_description ||
    product.short_desc ||
    product.why_sells ||
    `White label ${product.product_name} idea tailored for founders and business owners in your market.`
  );
}

async function fetchProduct(slug: string) {
  const conn = await db.getConnection();
  try {
    await ensureWhiteLabelProductsReady(conn);

    const [rows]: any = await conn.query(
      `
      SELECT p.*, COALESCE(v.views, 0) AS view_count
      FROM linescout_white_label_products p
      LEFT JOIN (
        SELECT product_id, COUNT(*) AS views
        FROM linescout_white_label_views
        GROUP BY product_id
      ) v ON v.product_id = p.id
      WHERE (p.slug = ? OR REGEXP_REPLACE(LOWER(p.product_name), '[^a-z0-9]+', '-') = ?) AND p.is_active = 1
      LIMIT 1
      `,
      [slug, slug]
    );

    return rows?.[0] || null;
  } finally {
    conn.release();
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchProduct(slug);
  if (!product) {
    return {
      title: "White Label Idea | LineScout",
      description: "Explore white label product ideas with pricing signals and sourcing guidance.",
    };
  }

  return {
    title: product.seo_title || `${product.product_name} | White Label Idea`,
    description: fallbackSeoDescription(product),
    openGraph: {
      title: product.seo_title || `${product.product_name} | White Label Idea`,
      description: fallbackSeoDescription(product),
      images: product.image_url ? [product.image_url] : undefined,
    },
  };
}

export default async function WhiteLabelIdeaDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <WhiteLabelIdeaDetailClient slug={slug} />;
}
