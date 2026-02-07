export type AgentOtpMode = "phone" | "email";

export async function fetchAgentOtpMode(): Promise<AgentOtpMode> {
  try {
    const res = await fetch("/api/internal/agents/auth/otp-mode", {
      cache: "no-store",
      credentials: "include",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.mode) return "phone";
    return String(data.mode).toLowerCase() === "email" ? "email" : "phone";
  } catch {
    return "phone";
  }
}
