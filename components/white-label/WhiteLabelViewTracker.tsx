"use client";

import { useEffect } from "react";

export default function WhiteLabelViewTracker({
  productId,
  source,
}: {
  productId: number;
  source?: string;
}) {
  useEffect(() => {
    if (!productId) return;
    const controller = new AbortController();

    fetch("/api/white-label/view", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ product_id: productId, source }),
      signal: controller.signal,
    }).catch(() => {});

    return () => controller.abort();
  }, [productId, source]);

  return null;
}
