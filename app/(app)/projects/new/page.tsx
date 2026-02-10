"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function NewProjectPage() {
  const router = useRouter();

  async function startSourcing() {
    router.push("/sourcing-project?route_type=machine_sourcing");
  }

  async function startWhiteLabel() {
    router.push("/white-label/start");
  }

  async function startSimpleSourcing() {
    router.push("/sourcing-project?route_type=simple_sourcing");
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
    </div>
  );
}
