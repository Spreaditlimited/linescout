"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewProjectPage() {
  const router = useRouter();
  const [showBrief, setShowBrief] = useState(false);
  const [briefRoute, setBriefRoute] = useState<"machine_sourcing" | "simple_sourcing">("machine_sourcing");
  const [briefStep, setBriefStep] = useState<"choice" | "form">("choice");
  const [briefProductName, setBriefProductName] = useState("");
  const [briefQuantity, setBriefQuantity] = useState("");
  const [briefDestination, setBriefDestination] = useState("");
  const [briefNotes, setBriefNotes] = useState("");
  const [briefErr, setBriefErr] = useState<string | null>(null);

  function trimmed(value: string, max = 500) {
    const s = String(value || "").trim();
    return s.length > max ? s.slice(0, max) : s;
  }

  async function startSourcing() {
    setBriefRoute("machine_sourcing");
    setBriefErr(null);
    setBriefStep("choice");
    setShowBrief(true);
  }

  async function startWhiteLabel() {
    router.push("/white-label/start");
  }

  async function startSimpleSourcing() {
    setBriefRoute("simple_sourcing");
    setBriefErr(null);
    setBriefStep("form");
    setShowBrief(true);
  }

  return (
    <div className="px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">New project</p>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Start a sourcing project</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Choose how you want to proceed. You can start a paid sourcing project, launch a simple sourcing request, or
            build a White Label workflow.
          </p>
        </div>
        <Link
          href="/projects"
          className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-800 hover:border-[rgba(45,52,97,0.35)]"
        >
          Back to projects
        </Link>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="flex h-full flex-col rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Machine sourcing</p>
          <h2 className="mt-3 text-xl font-semibold text-neutral-900">Start sourcing machines from China</h2>
          <p className="mt-2 text-sm text-neutral-600">
            We match you with a specialist who chats further with you to understand deeply what you want to produce and
            then finds the right manufacturer for you.
          </p>
          <div className="mt-auto pt-6">
            <button
              type="button"
              onClick={startSourcing}
              className="btn btn-primary w-full"
            >
              Start machine sourcing
            </button>
          </div>
        </div>

        <div className="flex h-full flex-col rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Simple sourcing</p>
          <h2 className="mt-3 text-xl font-semibold text-neutral-900">Source ready-made products in bulk</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Tell us what product you want and the quantities you need. We source verified suppliers and guide your order
            from inquiry to delivery.
          </p>
          <div className="mt-auto pt-6">
            <button
              type="button"
              onClick={startSimpleSourcing}
              className="btn btn-outline w-full"
            >
              Start simple sourcing
            </button>
          </div>
        </div>

        <div className="flex h-full flex-col rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">White label</p>
          <h2 className="mt-3 text-xl font-semibold text-neutral-900">Start a White Label workflow</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Build a factory-ready brief, review your project file, and activate sourcing for your branded product.
          </p>
          <div className="mt-auto pt-6">
            <button
              type="button"
              onClick={startWhiteLabel}
              className="btn btn-outline w-full"
            >
              Start your brand
            </button>
          </div>
        </div>
      </div>

      {showBrief ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <button
            aria-label="Close sourcing brief"
            className="absolute inset-0 bg-neutral-950/40 backdrop-blur-sm"
            onClick={() => setShowBrief(false)}
          />
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-2xl">
            <div className="p-6 sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
                {briefRoute === "simple_sourcing" ? "Simple Sourcing" : "Machine Sourcing"}
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-neutral-900">
                {briefRoute === "machine_sourcing" && briefStep === "choice"
                  ? "How would you like to start?"
                  : "Tell us what you want"}
              </h2>
              <p className="mt-2 text-sm text-neutral-600">
                {briefRoute === "machine_sourcing" && briefStep === "choice"
                  ? "Chat with LineScout AI to get clarity, or share your requirements now."
                  : "Share the basics. We’ll attach this brief to your paid chat after payment."}
              </p>

              {briefErr ? (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {briefErr}
                </div>
              ) : null}

              {briefRoute === "machine_sourcing" && briefStep === "choice" ? (
                <div className="mt-5 grid gap-3">
                  <button
                    type="button"
                    className="btn btn-primary w-full"
                    onClick={() => {
                      setShowBrief(false);
                      router.push("/machine?route_type=machine_sourcing");
                    }}
                  >
                    Chat with LineScout AI
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline w-full"
                    onClick={() => setBriefStep("form")}
                  >
                    I already know what I want
                  </button>
                </div>
              ) : (
                <div className="mt-5 grid gap-4">
                  <div>
                    <label className="text-xs font-semibold text-neutral-600">Product name</label>
                    <input
                      value={briefProductName}
                      onChange={(e) => setBriefProductName(e.target.value)}
                      className="mt-1 w-full rounded-2xl border border-neutral-200 px-3 py-2 text-sm"
                      placeholder={
                        briefRoute === "machine_sourcing"
                          ? "e.g. 5T/day groundnut oil production line"
                          : "e.g. Stainless steel water bottle"
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-neutral-600">Quantity</label>
                    <input
                      value={briefQuantity}
                      onChange={(e) => setBriefQuantity(e.target.value)}
                      className="mt-1 w-full rounded-2xl border border-neutral-200 px-3 py-2 text-sm"
                      placeholder={
                        briefRoute === "machine_sourcing"
                          ? "e.g. 1 line, 5 tons/day"
                          : "e.g. 2,000 units"
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-neutral-600">Destination</label>
                    <input
                      value={briefDestination}
                      onChange={(e) => setBriefDestination(e.target.value)}
                      className="mt-1 w-full rounded-2xl border border-neutral-200 px-3 py-2 text-sm"
                      placeholder={
                        briefRoute === "machine_sourcing"
                          ? "e.g. factory site (city, country)"
                          : "e.g. destination port (city, country)"
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-neutral-600">Notes</label>
                    <textarea
                      value={briefNotes}
                      onChange={(e) => setBriefNotes(e.target.value)}
                      className="mt-1 min-h-[96px] w-full rounded-2xl border border-neutral-200 px-3 py-2 text-sm"
                      placeholder={
                        briefRoute === "machine_sourcing"
                          ? "Power specs, voltage, budget range, target output, timeline, etc."
                          : "Specs, target price, delivery timeline, etc."
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowBrief(false)}
                className="btn btn-outline px-4 py-2 text-xs"
              >
                Cancel
              </button>
              {briefRoute === "machine_sourcing" && briefStep === "choice" ? null : (
                <button
                  type="button"
                  onClick={() => {
                    const product = trimmed(briefProductName, 160);
                    const qty = trimmed(briefQuantity, 80);
                    const dest = trimmed(briefDestination, 120);
                    const notes = trimmed(briefNotes, 1000);
                    if (!product) {
                      setBriefErr("Please enter a product name.");
                      return;
                    }
                    if (!qty) {
                      setBriefErr("Please enter an estimated quantity.");
                      return;
                    }
                    setBriefErr(null);
                    setShowBrief(false);
                    const qs = new URLSearchParams({
                      route_type: briefRoute,
                      simple_product_name: product,
                      simple_quantity: qty,
                      ...(dest ? { simple_destination: dest } : {}),
                      ...(notes ? { simple_notes: notes } : {}),
                    });
                    router.push(`/sourcing-project?${qs.toString()}`);
                  }}
                  className="btn btn-primary px-4 py-2 text-xs"
                >
                  Continue
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
