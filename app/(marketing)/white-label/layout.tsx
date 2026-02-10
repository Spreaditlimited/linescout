import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "White Label Product Ideas + China Manufacturing | LineScout",
  description:
    "Browse white label product ideas, pricing signals, and categories, then activate sourcing with verified manufacturers in China for Nigerian brands.",
  keywords: [
    "white label product ideas",
    "private label product ideas",
    "white label China Nigeria",
    "private label China Nigeria",
    "OEM China Nigeria",
    "custom packaging China",
    "product sourcing China Nigeria",
    "white label manufacturing",
    "Chinese manufacturers for Nigerian brands",
  ],
  alternates: {
    canonical: "https://linescout.sureimports.com/white-label",
  },
  openGraph: {
    title: "White Label Product Ideas for Nigerian Brands",
    description:
      "Search white label product ideas and move to verified China manufacturers with clear specs and pricing.",
    url: "https://linescout.sureimports.com/white-label",
    siteName: "LineScout",
    type: "website",
    images: [
      {
        url: "https://linescout.sureimports.com/white-label-social.png",
        width: 1200,
        height: 630,
        alt: "White Label Product Ideas for Nigerian Brands",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "White Label Product Ideas for Nigerian Brands",
    description:
      "Browse white label product ideas and activate sourcing with verified manufacturers in China.",
    images: ["https://linescout.sureimports.com/white-label-social.png"],
  },
};

export default function WhiteLabelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
