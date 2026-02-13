"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
  }
}

export default function MetaPixel() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== "undefined" && typeof window.fbq === "function") {
      window.fbq("track", "PageView");
    }
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search || "");
    const fbclid = String(params.get("fbclid") || "").trim();
    if (!fbclid) return;

    const existing = window.localStorage.getItem("linescout_fbclid") || "";
    if (existing !== fbclid) {
      window.localStorage.setItem("linescout_fbclid", fbclid);
    }

    const now = Math.floor(Date.now() / 1000);
    const fbc = `fb.1.${now}.${fbclid}`;
    window.localStorage.setItem("linescout_fbc", fbc);

    const cookie = typeof document !== "undefined" ? document.cookie || "" : "";
    const fbpMatch = cookie.match(/(?:^|;\\s*)_fbp=([^;]+)/);
    if (fbpMatch?.[1]) {
      window.localStorage.setItem("linescout_fbp", fbpMatch[1]);
    }

    window.localStorage.setItem("linescout_landing_url", window.location.href);
  }, [pathname]);

  return null;
}
