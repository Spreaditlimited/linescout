import type { Metadata } from "next";
import WhiteLabelIdeasPageClient from "@/components/white-label/WhiteLabelIdeasPageClient";
import {
  LINESCOUT_SOCIAL_IMAGE,
  LINESCOUT_SOCIAL_IMAGE_METADATA,
} from "@/lib/linescout-metadata";

export const runtime = "nodejs";
export const revalidate = 3600;
const BASE_URL = "https://linescout.sureimports.com";

type SearchParams = {
  q?: string;
  category?: string;
  page?: string;
  price?: string;
  regulatory?: string;
  sort?: string;
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}): Promise<Metadata> {
  const params = searchParams ? await searchParams : {};
  const q = String(params?.q || "").trim();
  const category = String(params?.category || "").trim();

  const title = category
    ? `${category} White Label Ideas | LineScout`
    : q
    ? `White Label Ideas: ${q} | LineScout`
    : "White Label Ideas | LineScout";

  const description = category
    ? `Explore ${category} white label ideas with pricing signals and sourcing guidance.`
    : q
    ? `Search results for “${q}” in white label product ideas.`
    : "Browse white label product ideas and start a sourcing project when you are ready.";

  const url = category
    ? `${BASE_URL}/white-label/ideas?category=${encodeURIComponent(category)}`
    : q
    ? `${BASE_URL}/white-label/ideas?q=${encodeURIComponent(q)}`
    : `${BASE_URL}/white-label/ideas`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "LineScout",
      type: "website",
      images: [LINESCOUT_SOCIAL_IMAGE_METADATA],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [LINESCOUT_SOCIAL_IMAGE],
    },
  };
}

export default async function WhiteLabelIdeasPage() {
  return <WhiteLabelIdeasPageClient />;
}
