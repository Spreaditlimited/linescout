import Link from "next/link";

const WHATSAPP_LINK = "https://wa.me/message/CUR7YKW3K3RBA1";

export default function FloatingWhatsAppButton() {
  return (
    <Link
      href={WHATSAPP_LINK}
      className="fixed bottom-6 right-6 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_14px_30px_rgba(37,211,102,0.35)] transition-transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-[#25D366]/30"
      aria-label="Chat with LineScout on WhatsApp"
      target="_blank"
      rel="noreferrer"
    >
      <svg viewBox="0 0 32 32" aria-hidden="true" className="h-7 w-7 fill-current">
        <path d="M16 3C8.83 3 3 8.61 3 15.5c0 2.7.9 5.2 2.42 7.25L4 29l6.52-1.72A13.2 13.2 0 0 0 16 28c7.17 0 13-5.61 13-12.5S23.17 3 16 3zm0 23.2c-2.02 0-3.9-.58-5.47-1.57l-.39-.25-3.87 1.02 1.03-3.73-.26-.38A10.36 10.36 0 0 1 5.6 15.5C5.6 10.2 10.23 6 16 6s10.4 4.2 10.4 9.5S21.77 26.2 16 26.2zm5.78-7.45c-.31-.15-1.84-.9-2.12-1-.28-.1-.48-.15-.68.15-.2.31-.78 1-.95 1.2-.17.2-.35.23-.66.08-.31-.15-1.3-.47-2.48-1.5-.92-.8-1.54-1.8-1.72-2.1-.18-.3-.02-.46.13-.61.13-.13.31-.35.46-.52.15-.18.2-.3.3-.5.1-.2.05-.38-.03-.53-.08-.15-.68-1.62-.93-2.22-.24-.58-.48-.5-.66-.5h-.57c-.2 0-.53.08-.8.38-.27.3-1.05 1-1.05 2.45s1.08 2.85 1.23 3.05c.15.2 2.13 3.3 5.17 4.62.72.31 1.29.5 1.73.64.73.23 1.39.2 1.92.12.59-.09 1.84-.74 2.1-1.45.26-.7.26-1.3.18-1.45-.08-.15-.28-.23-.59-.38z" />
      </svg>
    </Link>
  );
}
