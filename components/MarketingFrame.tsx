"use client";

import { useEffect } from "react";

export default function MarketingFrame({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const prevBg = document.body.style.background;
    const prevPaddingBottom = document.body.style.paddingBottom;
    const prevHtmlBg = document.documentElement.style.background;
    const prevHtmlPaddingBottom = document.documentElement.style.paddingBottom;
    const prevBodyMinHeight = document.body.style.minHeight;
    const prevHtmlMinHeight = document.documentElement.style.minHeight;
    const prevBodyHeight = document.body.style.height;
    const prevHtmlHeight = document.documentElement.style.height;

    document.body.style.background = "#F7F6F2";
    document.body.style.paddingBottom = "0px";
    document.documentElement.style.background = "#0F1C18";
    document.documentElement.style.paddingBottom = "0px";
    document.body.style.minHeight = "";
    document.documentElement.style.minHeight = "";
    document.body.style.height = "";
    document.documentElement.style.height = "";

    return () => {
      document.body.style.background = prevBg;
      document.body.style.paddingBottom = prevPaddingBottom;
      document.documentElement.style.background = prevHtmlBg;
      document.documentElement.style.paddingBottom = prevHtmlPaddingBottom;
      document.body.style.minHeight = prevBodyMinHeight;
      document.documentElement.style.minHeight = prevHtmlMinHeight;
      document.body.style.height = prevBodyHeight;
      document.documentElement.style.height = prevHtmlHeight;
    };
  }, []);

  return <>{children}</>;
}
