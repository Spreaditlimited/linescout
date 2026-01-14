import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Machine Sourcing from China for Nigeria | LineScout by Sure Imports",
  description:
    "Understand how to source industrial and agro-processing machines from China for Nigeria. LineScout helps you think through capacity, power, compliance, shipping, clearing, and execution risks.",
  alternates: {
    canonical: "https://linescout.sureimports.com/machine-sourcing",
  },
  openGraph: {
    title: "Machine Sourcing from China for Nigeria",
    description:
      "Nigeria-aware guidance for sourcing machines from China. Think through capacity, power, and landed costs before importing.",
    url: "https://linescout.sureimports.com/machine-sourcing",
    siteName: "LineScout",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Machine Sourcing from China for Nigeria",
    description:
      "Nigeria-aware guidance for sourcing machines from China. Think through capacity, power, and landed costs before importing.",
    images: ["https://linescout.sureimports.com/linescout-social.png"],
  },
};

export default function MachineSourcingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}