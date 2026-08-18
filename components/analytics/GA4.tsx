"use client";

import { GoogleAnalytics } from "@next/third-parties/google";
import { usePathname } from "next/navigation";

const GA_ID = process.env.NEXT_PUBLIC_GA_TRACKING_ID || "G-CMGHVCHW1D";

export default function GA4() {
  const pathname = usePathname();

  if (pathname.startsWith("/internal")) return null;

  return <GoogleAnalytics gaId={GA_ID} />;
}
