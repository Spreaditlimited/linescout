"use client";

import { useEffect, useState } from "react";

type PasswordModalProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onCancel: () => void;
  onConfirm: (password: string) => void;
};

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  let pw = "";
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

export default function PasswordModal({
  open,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onCancel,
  onConfirm,
}: PasswordModalProps) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPw("");
      setErr(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-2xl">
        <h3 className="text-lg font-semibold text-neutral-100">{title}</h3>

        {description ? (
          <p className="mt-2 text-sm text-neutral-400">{description}</p>
        ) : null}

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <label className="text-xs text-neutral-400">New password</label>

            <button
              type="button"
              onClick={() => {
                const p = genPassword();
                setPw(p);
                setErr(null);
              }}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs text-neutral-200 hover:border-neutral-700"
            >
              Generate
            </button>
          </div>

          <input
            value={pw}
            onChange={(e) => {
              setPw(e.target.value);
              setErr(null);
            }}
            type="text"
            className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
            placeholder="Minimum 8 characters"
            autoFocus
          />

          {err ? <div className="mt-2 text-xs text-red-300">{err}</div> : null}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:border-neutral-700"
          >
            {cancelText}
          </button>

          <button
            onClick={() => {
              const v = pw.trim();
              if (v.length < 8) {
                setErr("Password must be at least 8 characters.");
                return;
              }
              onConfirm(v);
            }}
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}