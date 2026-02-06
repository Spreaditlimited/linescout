"use client";

import type { ReactNode } from "react";
import AgentAppGate from "./_components/AgentAppGate";

export default function AgentAppLayout({ children }: { children: ReactNode }) {
  return <AgentAppGate>{children}</AgentAppGate>;
}
