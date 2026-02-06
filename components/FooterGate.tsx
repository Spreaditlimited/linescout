"use client";

import { usePathname } from "next/navigation";
import Footer from "@/components/Footer";

export default function FooterGate() {
  const pathname = usePathname();

  const hideFooter =
    pathname.startsWith("/machine-sourcing") ||
    pathname.startsWith("/white-label/step-") ||
    pathname.startsWith("/white-label/start");

  if (hideFooter) return null;

  return <Footer />;
}
