"use client";

import { Mail, ShieldCheck, Trash2 } from "lucide-react";
import MarketingFrame from "@/components/MarketingFrame";

export default function AccountDeletionPage() {
  return (
    <MarketingFrame>
      <div className="relative flex min-h-screen flex-col bg-slate-50 text-slate-950">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 right-[-180px] h-[420px] w-[420px] rounded-full bg-orange-100/70 blur-3xl" />
          <div className="absolute -bottom-40 left-[-140px] h-[380px] w-[380px] rounded-full bg-indigo-100/70 blur-3xl" />
        </div>

        <main className="relative flex-1">
          <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-10 sm:px-6 md:pt-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-semibold text-orange-700">
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
              <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-orange-700">
                  <Mail className="h-4 w-4" />
                  Step 1 — Send a deletion request
                </div>
                <p className="mt-3 text-sm text-neutral-700">
                  Email our support team and include the details below. We will verify ownership and begin the
                  deletion process.
                </p>
                <div className="mt-4 rounded-2xl border border-orange-100 bg-orange-50/70 p-4 text-sm text-neutral-800">
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

              <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-orange-700">
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

            <div className="mt-8 rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
              <p className="text-sm text-neutral-700">
                Questions? Contact <span className="font-semibold text-neutral-900">hello@sureimports.com</span> and
                we will assist you.
              </p>
            </div>
          </section>
        </main>

      </div>
    </MarketingFrame>
  );
}
