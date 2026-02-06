"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function WhiteLabelWizardLegacyPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/white-label/start");
  }, [router]);

  return null;
}
