import { Suspense } from "react";
import OnboardingNameClient from "./OnboardingNameClient";

export default function OnboardingNamePage() {
  return (
    <Suspense fallback={null}>
      <OnboardingNameClient />
    </Suspense>
  );
}
