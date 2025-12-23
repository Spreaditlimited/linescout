"use client";

import { track } from "@/lib/metaPixel";

export default function WhatsAppFloat() {
  const href = "https://wa.me/message/CUR7YKW3K3RBA1";

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // Ensure tracking fires before navigation
    e.preventDefault();

    track("Contact", {
      content_name: "WhatsApp",
      content_category: "LineScout",
      button_location: "home_floating",
    });

    // Small delay so Meta Pixel is not interrupted
    setTimeout(() => {
      window.open(href, "_blank", "noopener,noreferrer");
    }, 120);
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      aria-label="Chat on WhatsApp"
      className="fixed bottom-5 right-5 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] shadow-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-white/60"
    >
      <svg viewBox="0 0 32 32" className="h-6 w-6 fill-white" aria-hidden="true">
        <path d="M19.11 17.53c-.27-.14-1.6-.79-1.85-.88-.25-.09-.43-.14-.61.14-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.14-1.14-.42-2.17-1.33-.8-.71-1.34-1.59-1.5-1.86-.16-.27-.02-.42.12-.56.12-.12.27-.32.41-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.14-.61-1.48-.84-2.03-.22-.53-.44-.46-.61-.47l-.52-.01c-.18 0-.48.07-.73.34-.25.27-.96.94-.96 2.3 0 1.36.99 2.67 1.13 2.86.14.18 1.95 2.98 4.73 4.18.66.29 1.17.46 1.57.59.66.21 1.26.18 1.73.11.53-.08 1.6-.65 1.83-1.28.23-.63.23-1.17.16-1.28-.07-.11-.25-.18-.52-.32z" />
        <path d="M26.67 5.33A13.26 13.26 0 0 0 16 1C8.82 1 3 6.82 3 14c0 2.28.6 4.5 1.75 6.45L3 31l10.79-1.72A12.9 12.9 0 0 0 16 27c7.18 0 13-5.82 13-13 0-3.47-1.35-6.74-3.33-8.67zM16 25.05c-2.02 0-4-.54-5.72-1.56l-.41-.24-6.4 1.02 1.01-6.23-.27-.44A10.95 10.95 0 0 1 5.02 14C5.02 7.94 9.94 3.02 16 3.02S26.98 7.94 26.98 14 22.06 25.05 16 25.05z" />
      </svg>
    </a>
  );
}