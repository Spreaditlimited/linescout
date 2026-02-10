"use client";

import Image from "next/image";
import Link from "next/link";
import { Mail, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import Footer from "@/components/Footer";
import MarketingFrame from "@/components/MarketingFrame";

export default function AccountDeletionPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <MarketingFrame>
      <div className="relative flex min-h-screen flex-col bg-[#F7F6F2] text-neutral-900">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 right-[-180px] h-[420px] w-[420px] rounded-full bg-emerald-200/45 blur-3xl" />
          <div className="absolute -bottom-40 left-[-140px] h-[380px] w-[380px] rounded-full bg-emerald-100/60 blur-3xl" />
        </div>

        <header className="z-40 border-b border-emerald-100 bg-[#F7F6F2]/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <Image src="/linescout-logo.png" alt="LineScout" width={130} height={36} priority />
              <span className="hidden h-7 w-px rounded-full bg-emerald-200 sm:inline-block" />
              <div className="hidden sm:block">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700">
                  Nigeria-first sourcing
                </p>
                <p className="text-xs text-neutral-500">AI clarity + specialist execution</p>
              </div>
            </div>
            <nav className="hidden items-center gap-6 text-sm font-semibold text-neutral-700 lg:flex">
              <Link href="/#features" className="hover:text-emerald-700">
                Features
              </Link>
              <Link href="/#how" className="hover:text-emerald-700">
                How it works
              </Link>
              <Link href="/#agents" className="hover:text-emerald-700">
                For agents
              </Link>
            </nav>
            <div className="flex items-center gap-2">
              <Link
                href="/sign-in"
                className="hidden rounded-full border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-900 shadow-sm hover:border-emerald-300 lg:inline-flex"
              >
                Continue on web
              </Link>
              <button
                type="button"
                aria-label="Toggle menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-emerald-100 bg-white text-emerald-900 shadow-sm lg:hidden"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span className="text-lg font-semibold">≡</span>
              </button>
            </div>
          </div>
          {menuOpen ? (
            <div className="border-t border-emerald-100 bg-white/90 px-4 py-3 text-sm font-semibold text-neutral-700 lg:hidden">
              <div className="flex flex-col gap-3">
                <Link href="/#features" className="hover:text-emerald-700" onClick={() => setMenuOpen(false)}>
                  Features
                </Link>
                <Link href="/#how" className="hover:text-emerald-700" onClick={() => setMenuOpen(false)}>
                  How it works
                </Link>
                <Link href="/#agents" className="hover:text-emerald-700" onClick={() => setMenuOpen(false)}>
                  For agents
                </Link>
                <Link href="/sign-in" className="hover:text-emerald-700" onClick={() => setMenuOpen(false)}>
                  Continue on web
                </Link>
              </div>
            </div>
          ) : null}
        </header>

        <main className="relative flex-1">
          <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-10 sm:px-6 md:pt-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
              Account deletion request
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Request deletion of your LineScout account and data
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-700 sm:text-base">
              This page applies to the LineScout app published by Sure Importers Limited. Follow the steps below to
              request deletion of your account and associated data.
            </p>

            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <div className="rounded-3xl border border-emerald-100 bg-white/80 p-6 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                  <Mail className="h-4 w-4" />
                  Step 1 — Send a deletion request
                </div>
                <p className="mt-3 text-sm text-neutral-700">
                  Email our support team and include the details below. We will verify ownership and begin the
                  deletion process.
                </p>
                <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-neutral-800">
                  <p className="font-semibold">Email subject</p>
                  <p className="mt-1">LineScout Account Deletion Request</p>
                  <p className="mt-4 font-semibold">Send to</p>
                  <p className="mt-1">hello@sureimports.com</p>
                  <p className="mt-4 font-semibold">Include</p>
                  <ul className="mt-2 list-disc pl-5 text-neutral-700">
                    <li>Your registered email address or phone number</li>
                    <li>The app name: LineScout (user app or agent app)</li>
                    <li>Your full name (if provided in profile)</li>
                  </ul>
                </div>
              </div>

              <div className="rounded-3xl border border-emerald-100 bg-white/80 p-6 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                  <Trash2 className="h-4 w-4" />
                  Step 2 — We delete your data
                </div>
                <p className="mt-3 text-sm text-neutral-700">
                  Once verified, we delete or anonymize your account data within 7 days. Some records may be retained
                  for legal or financial compliance.
                </p>
                <div className="mt-4 grid gap-4 text-sm">
                  <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                    <p className="font-semibold text-neutral-900">Data deleted</p>
                    <ul className="mt-2 list-disc pl-5 text-neutral-700">
                      <li>Profile information (name, email, phone)</li>
                      <li>Projects, chats, and attachments</li>
                      <li>Device tokens and notification settings</li>
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                    <p className="font-semibold text-neutral-900">Data retained</p>
                    <ul className="mt-2 list-disc pl-5 text-neutral-700">
                      <li>Payment records and invoices (up to 7 years where required)</li>
                      <li>Audit and fraud-prevention logs (retained as required by law)</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 rounded-3xl border border-emerald-100 bg-white/90 p-6 shadow-sm">
              <p className="text-sm text-neutral-700">
                Questions? Contact <span className="font-semibold text-neutral-900">hello@sureimports.com</span> and
                we will assist you.
              </p>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </MarketingFrame>
  );
}
