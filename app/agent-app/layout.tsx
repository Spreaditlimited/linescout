import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LineScout Agent App",
  description:
    "Private workspace for approved LineScout sourcing agents.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
    noimageindex: true,
    nocache: true,
  },
};

export default function AgentAppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
