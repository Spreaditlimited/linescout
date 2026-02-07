import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LineScout Agent App",
  description:
    "The premium workspace for LineScout agents in China. Claim paid chats, manage projects, and withdraw earnings.",
};

export default function AgentAppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
