"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function AboutModal({ open, onClose }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // ESC to close
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Lock background scroll while open
  useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    //document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      {/* click backdrop to close */}
      <button
        type="button"
        aria-label="Close About modal"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />

      {/* modal container */}
      <div className="relative mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <div className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl">
          {/* header */}
          <div className="flex items-start justify-between gap-4 border-b border-neutral-800 bg-neutral-950 px-5 py-4">
            <h2 className="text-base sm:text-lg font-semibold text-neutral-100">
              About Sure Importers Limited
            </h2>

            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:border-neutral-700"
            >
              Close
            </button>
          </div>

          {/* body (scrolls) */}
          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
            <div className="space-y-4 text-sm text-neutral-300 leading-relaxed">
              <p>
                <strong>Sure Importers Limited</strong> is a Nigeria based import and
                sourcing company that helps individuals and businesses purchase products
                and machines directly from China.
              </p>

              <p>
                We support customers across Nigeria and other markets in sourcing original
                phones and laptops, special products, factory machines, and complete production
                lines. Our work covers the full sourcing process, from supplier verification and
                product selection to shipping and delivery.
              </p>

              <p>
                Our approach is simple. We take time to understand what you want to buy, where it
                will be used, and what it will take to operate successfully. For machines, this
                includes capacity, power requirements, operating conditions, and landing costs.
                We believe these questions should be answered before money is spent, not after goods arrive.
              </p>

              <p>
                At Sure Importers Limited, we focus on clarity and proper decision making. We do not
                rush clients into purchases or promote products without context. Our role is to guide
                you through the realities of importing so you can make informed choices.
              </p>

              <p>
                We are built on long term relationships and repeat business. Whether you are importing
                a single item or setting up a production line, our goal is to help you import with fewer
                mistakes and better outcomes.
              </p>

              <hr className="border-neutral-800" />

              <div className="space-y-3">
                <h3 className="font-semibold text-neutral-200">Contact Information</h3>

                <div>
                  <div className="text-neutral-400 text-xs">Address</div>
                  <div className="mt-1">
                    5 Olutosin Ajayi (Martins Adegboyega) Street,
                    <br />
                    Ajao Estate, Lagos
                  </div>
                </div>

                <div>
                  <div className="text-neutral-400 text-xs">Phone</div>
                  <div className="mt-1">+234 806 458 3664</div>
                  <div>+234 806 839 7263</div>
                </div>

                <div>
                  <div className="text-neutral-400 text-xs">Email</div>
                  <div className="mt-1">hello@sureimports.com</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* stop backdrop button from covering modal */}
        <div className="pointer-events-none absolute inset-0" />
      </div>
    </div>,
    document.body
  );
}