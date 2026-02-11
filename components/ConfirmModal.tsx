"use client";

import type { ReactNode } from "react";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  children?: ReactNode;
  variant?: "dark" | "light";
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
  variant = "dark",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  const isDark = variant === "dark";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm">
      <div
        className={`w-full max-w-md rounded-3xl border p-6 shadow-2xl ${
          isDark
            ? "border-neutral-800 bg-neutral-950 text-neutral-100"
            : "border-[rgba(45,52,97,0.14)] bg-white text-neutral-900"
        }`}
      >
        <h3 className="text-lg font-semibold">{title}</h3>

        {description ? (
          <p className={`mt-2 text-sm ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
            {description}
          </p>
        ) : null}

        {children ? <div className="mt-3">{children}</div> : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className={`rounded-2xl border px-4 py-2 text-sm font-semibold ${
              isDark
                ? "border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-neutral-700"
                : "border-[rgba(45,52,97,0.2)] text-[#2D3461] hover:bg-[rgba(45,52,97,0.08)]"
            }`}
          >
            {cancelText}
          </button>

          <button
            onClick={onConfirm}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold ${
              danger
                ? isDark
                  ? "bg-red-600 text-white hover:bg-red-500"
                  : "bg-red-600 text-white hover:bg-red-500"
                : isDark
                ? "bg-white text-neutral-950 hover:bg-neutral-200"
                : "bg-[#2D3461] text-white hover:bg-[#242b56]"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
