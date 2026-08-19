import type { Metadata } from "next";
import {
  LINESCOUT_SOCIAL_IMAGE,
  LINESCOUT_SOCIAL_IMAGE_METADATA,
} from "@/lib/linescout-metadata";

export const metadata: Metadata = {
  title: "Machine Sourcing from China | LineScout by Sure Imports",
  description:
    "Understand how to source industrial and agro-processing machines from China for your market. LineScout helps you think through capacity, power, compliance, shipping, clearing, and execution risks.",
  alternates: {
    canonical: "https://linescout.sureimports.com/machine-sourcing",
  },
  openGraph: {
    title: "Machine Sourcing from China",
    description:
      "Market-aware guidance for sourcing machines from China. Think through capacity, power, and landed costs before importing.",
    url: "https://linescout.sureimports.com/machine-sourcing",
    siteName: "LineScout",
    type: "website",
    images: [LINESCOUT_SOCIAL_IMAGE_METADATA],
  },
  twitter: {
    card: "summary_large_image",
    title: "Machine Sourcing from China",
    description:
      "Market-aware guidance for sourcing machines from China. Think through capacity, power, and landed costs before importing.",
    images: [LINESCOUT_SOCIAL_IMAGE],
  },
};

export default function MachineSourcingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
