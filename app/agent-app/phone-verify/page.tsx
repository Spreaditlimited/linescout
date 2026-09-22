import { Suspense } from "react";
import AuthShell from "../_components/AuthShell";
import styles from "../_components/AgentAuth.module.css";
import AgentAppPhoneVerifyClient from "./AgentAppPhoneVerifyClient";

function Fallback() {
  return (
    <AuthShell
      title="Verify phone"
      subtitle="Confirm your phone number to access the agent workspace."
    >
      <div role="status" className={styles.notice}>
        Loading…
      </div>
    </AuthShell>
  );
}

export default function AgentAppPhoneVerifyPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <AgentAppPhoneVerifyClient />
    </Suspense>
  );
}
