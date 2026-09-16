"use client";

import { useEffect, useState } from "react";
import ConfirmModal from "./ConfirmModal";

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

  return <ConfirmModal open={open} title={title} description={description} confirmText={confirmText} cancelText={cancelText} onCancel={onCancel} onConfirm={() => { const value=pw.trim(); if(value.length<8){setErr("Password must be at least 8 characters.");return;} onConfirm(value); }}>
    <div className="li-password-form"><label htmlFor="new-agent-password">New password</label><div><input id="new-agent-password" value={pw} onChange={event=>{setPw(event.target.value);setErr(null);}} type="text" autoComplete="new-password" placeholder="Minimum 8 characters" /><button type="button" onClick={()=>{setPw(genPassword());setErr(null);}}>Generate</button></div>{err && <p role="alert">{err}</p>}</div>
  </ConfirmModal>;
}
