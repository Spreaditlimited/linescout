"use client";

type ComingSoonModalProps = {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
};

export default function ComingSoonModal({
  open,
  title,
  message,
  onClose,
}: ComingSoonModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-label="Close modal"
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-neutral-950 text-white shadow-2xl">
        <div className="relative px-6 py-6">
          <div className="absolute -top-16 right-[-60px] h-40 w-40 rounded-full bg-emerald-500/30 blur-3xl" />
          <div className="absolute -bottom-16 left-[-40px] h-40 w-40 rounded-full bg-sky-500/20 blur-3xl" />

          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
              Coming soon
            </p>
            <h3 className="mt-2 text-2xl font-semibold">{title}</h3>
            <p className="mt-3 text-sm text-white/70">{message}</p>

            <button
              type="button"
              onClick={onClose}
              className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-white/90"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
