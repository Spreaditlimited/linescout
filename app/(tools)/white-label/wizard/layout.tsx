import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "White Label Project Wizard | LineScout",
  description:
    "White Label project specification wizard. Build a factory-ready brief before activation.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function WhiteLabelWizardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}