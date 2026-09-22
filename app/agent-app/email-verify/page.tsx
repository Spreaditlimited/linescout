import { Suspense } from "react";
import AuthShell from "../_components/AuthShell";
import styles from "../_components/AgentAuth.module.css";
import AgentAppEmailVerifyClient from "./AgentAppEmailVerifyClient";

function Fallback() {
  return (
    <AuthShell
      title="Verify email"
      subtitle="Confirm your email address to access the agent workspace."
    >
      <div role="status" className={styles.notice}>
        Loading…
      </div>
    </AuthShell>
  );
}

export default function AgentAppEmailVerifyPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <AgentAppEmailVerifyClient />
    </Suspense>
  );
}
