"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

type WhatsAppContact = {
  id: string;
  label: string;
  description?: string;
  phone?: string;
  messageId?: string;
  defaultMessage?: string;
};

const FALLBACK_CONTACTS: WhatsAppContact[] = [
  {
    id: "general",
    label: "General Enquiries",
    description: "Sales, sourcing, shipping, and account support",
    messageId: "CUR7YKW3K3RBA1",
  },
];

const DEFAULT_MESSAGE = "Hello! I'd like to ask about your services.";

function WhatsAppIcon({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={`${className} fill-current`}>
      <path d="M16 3C8.83 3 3 8.61 3 15.5c0 2.7.9 5.2 2.42 7.25L4 29l6.52-1.72A13.2 13.2 0 0 0 16 28c7.17 0 13-5.61 13-12.5S23.17 3 16 3zm0 23.2c-2.02 0-3.9-.58-5.47-1.57l-.39-.25-3.87 1.02 1.03-3.73-.26-.38A10.36 10.36 0 0 1 5.6 15.5C5.6 10.2 10.23 6 16 6s10.4 4.2 10.4 9.5S21.77 26.2 16 26.2zm5.78-7.45c-.31-.15-1.84-.9-2.12-1-.28-.1-.48-.15-.68.15-.2.31-.78 1-.95 1.2-.17.2-.35.23-.66.08-.31-.15-1.3-.47-2.48-1.5-.92-.8-1.54-1.8-1.72-2.1-.18-.3-.02-.46.13-.61.13-.13.31-.35.46-.52.15-.18.2-.3.3-.5.1-.2.05-.38-.03-.53-.08-.15-.68-1.62-.93-2.22-.24-.58-.48-.5-.66-.5h-.57c-.2 0-.53.08-.8.38-.27.3-1.05 1-1.05 2.45s1.08 2.85 1.23 3.05c.15.2 2.13 3.3 5.17 4.62.72.31 1.29.5 1.73.64.73.23 1.39.2 1.92.12.59-.09 1.84-.74 2.1-1.45.26-.7.26-1.3.18-1.45-.08-.15-.28-.23-.59-.38z" />
    </svg>
  );
}

function buildWhatsAppUrl(contact: WhatsAppContact) {
  const message = contact.defaultMessage || DEFAULT_MESSAGE;

  if (contact.phone) {
    return `https://wa.me/${contact.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
  }

  if (contact.messageId) {
    return `https://wa.me/message/${contact.messageId}?text=${encodeURIComponent(message)}`;
  }

  return "#";
}

export default function FloatingWhatsAppButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [managedContacts, setManagedContacts] = useState<WhatsAppContact[] | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetch("/api/admin-whatsapp", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (response.ok && Array.isArray(payload?.data) && isMounted) {
          setManagedContacts(payload.data);
        }
      })
      .catch(() => {
        if (isMounted) setManagedContacts(null);
      });

    return () => {
      isMounted = false;
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  const contacts = useMemo(
    () => (managedContacts?.length ? managedContacts : FALLBACK_CONTACTS),
    [managedContacts]
  );

  const cancelClose = () => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
  };

  const closeWithDelay = () => {
    closeTimeoutRef.current = setTimeout(() => setIsOpen(false), 120);
  };

  return (
    <div
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 z-[70]"
      onMouseEnter={cancelClose}
      onMouseLeave={closeWithDelay}
    >
      {isOpen ? (
        <div
          id="whatsapp-contact-panel"
          className="absolute bottom-20 left-0 w-[min(calc(100vw-2rem),22rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-slate-900">Chat on WhatsApp</p>
              <p className="text-xs text-slate-500">Choose the right team</p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="Close WhatsApp contacts"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>

          <div className="max-h-[22rem] overflow-y-auto p-2">
            {contacts.map((contact) => (
              <a
                key={contact.id}
                href={buildWhatsAppUrl(contact)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-green-50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500 text-white">
                  <WhatsAppIcon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-900">{contact.label}</span>
                  {contact.description ? (
                    <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                      {contact.description}
                    </span>
                  ) : null}
                </span>
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white shadow-lg shadow-green-900/20 transition hover:bg-green-600 focus:outline-none focus:ring-4 focus:ring-green-500/25"
        aria-expanded={isOpen}
        aria-controls="whatsapp-contact-panel"
        aria-label="Contact us on WhatsApp"
        title="Contact us on WhatsApp"
      >
        <span className="relative flex items-center">
          <WhatsAppIcon />
          <ChevronDown
            aria-hidden="true"
            size={14}
            className={`absolute -bottom-2 -right-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </span>
      </button>
    </div>
  );
}
