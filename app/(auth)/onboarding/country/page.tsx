import { Suspense } from "react";
import OnboardingCountryClient from "./OnboardingCountryClient";

export default function OnboardingCountryPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingCountryClient />
    </Suspense>
  );
}
