import type { ReactNode } from "react";

"use client";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmModal({
  open,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false,
  children,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-2xl">
        <h3 className="text-lg font-semibold text-neutral-100">{title}</h3>

        {description ? (
          <p className="mt-2 text-sm text-neutral-400">{description}</p>
        ) : null}

        {children ? <div className="mt-3">{children}</div> : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:border-neutral-700"
          >
            {cancelText}
          </button>

          <button
            onClick={onConfirm}
            className={`rounded-xl px-4 py-2 text-sm font-medium ${
              danger
                ? "bg-red-600 text-white hover:bg-red-500"
                : "bg-white text-neutral-950 hover:bg-neutral-200"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}