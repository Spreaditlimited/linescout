import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "White Label Manufacturing in China for Nigerian Brands | LineScout",
  description:
    "Launch white label products with verified manufacturers in China. Build a factory-ready brief, choose branding depth, and activate sourcing with a refundable deposit.",
  keywords: [
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
    title: "White Label Manufacturing in China for Nigerian Brands",
    description:
      "Verified manufacturers in China for Nigerian brands. Define specs, branding, and quantities clearly before sourcing.",
    url: "https://linescout.sureimports.com/white-label",
    siteName: "LineScout",
    type: "website",
    images: [
      {
        url: "https://linescout.sureimports.com/white-label-social.png",
        width: 1200,
        height: 630,
        alt: "White Label Manufacturing in China for Nigerian Brands",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "White Label Manufacturing in China for Nigerian Brands",
    description:
      "Build a factory-ready brief and activate sourcing with verified manufacturers in China.",
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