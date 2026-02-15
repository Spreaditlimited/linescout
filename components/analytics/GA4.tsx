"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const GA_ID = "G-8WR9YJV7XN";

export default function GA4() {
  const pathname = usePathname();

  // Exclude /internal pages entirely
  if (pathname.startsWith("/internal")) return null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    // @ts-expect-error gtag exists after script load
    if (typeof window.gtag === "function") {
      // @ts-expect-error gtag exists after script load
      window.gtag("config", GA_ID, { page_path: pathname });
    }
  }, [pathname]);

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}', { page_path: window.location.pathname });
        `}
      </Script>
    </>
  );
}
